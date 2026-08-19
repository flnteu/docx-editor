#!/usr/bin/env bash
# FluentaOne npm-consumability probe (DEV-2291).
#
# Answers one question with a measurement instead of an assumption:
#
#   Can a FluentaOne repo, using plain npm, consume @docx-editor.dev/core and
#   @docx-editor.dev/react from a gate-green tag of THIS fork?
#
# It probes both candidate paths and expects a different verdict from each:
#
#   1. git dependency  — `npm install git+ssh://…/docx-editor.git#<tag>`
#      EXPECTED TO FAIL. Asserted here so the failure stays a measured fact
#      rather than folklore, and so the day npm gains monorepo-subdirectory
#      support this probe is what tells us.
#
#   2. packed tarballs — build the fork, `npm pack` the published packages,
#      install the tarballs into an empty npm project, then import both
#      packages and build a real Vite app against them.
#      EXPECTED TO PASS. This is the supported path; see FLNTEU-README.md.
#
# Usage:  bash .github/flnteu/npm-consumability-probe.sh [git-url] [ref]
# Default: this working tree, on its current HEAD.
#
# Requires bun (to build the fork) and npm (to consume it, as a consumer would).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GIT_URL="${1:-git+file://$REPO_ROOT}"
REF="${2:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
WORK="$(mktemp -d -t docx-editor-consumability-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

# Every published (non-private) workspace under packages/.
PUBLISHED=(core i18n fonts react editor-api pro)

pass=0
fail=0
say() { printf '\n=== %s ===\n' "$1"; }
ok() {
  printf '  PASS  %s\n' "$1"
  pass=$((pass + 1))
}
no() {
  printf '  FAIL  %s\n' "$1"
  fail=$((fail + 1))
}

say "probe 1: npm install of the git dependency (expected to FAIL)"
mkdir -p "$WORK/git-dep" && (cd "$WORK/git-dep" && npm init -y >/dev/null 2>&1)
git_out="$(cd "$WORK/git-dep" && npm install "$GIT_URL#$REF" 2>&1)"
git_code=$?
if [ $git_code -ne 0 ]; then
  if grep -q 'EUNSUPPORTEDPROTOCOL' <<<"$git_out"; then
    ok "git dep rejected with EUNSUPPORTEDPROTOCOL (npm cannot read \`workspace:*\`)"
  else
    ok "git dep failed (exit $git_code)"
  fi
  printf '        %s\n' "$(grep -m1 -E 'npm error (code )?[A-Z]+' <<<"$git_out" | head -1)"
else
  # It "succeeded" — but succeeding is not the same as being usable. npm
  # installs the package at the REPOSITORY ROOT, and this repo's root is the
  # private monorepo, not a consumable package.
  if [ -d "$WORK/git-dep/node_modules/@docx-editor.dev" ]; then
    no "git dep unexpectedly produced @docx-editor.dev/* — re-read FLNTEU-README, npm may have gained subdirectory support"
  else
    ok "git dep installed, but yielded '$(ls "$WORK/git-dep/node_modules" | grep -m1 docx-editor)' and no @docx-editor.dev/* (npm installs the repo ROOT package)"
  fi
fi

say "probe 2: build + npm pack + install the tarballs (expected to PASS)"
SRC="$WORK/src"
git clone --quiet --no-local "${GIT_URL#git+file://}" "$SRC" --branch "$REF" 2>/dev/null ||
  git clone --quiet "${GIT_URL#git+}" "$SRC" --branch "$REF"
(cd "$SRC" && bun install --frozen-lockfile >/dev/null 2>&1) || {
  no "bun install --frozen-lockfile in a fresh clone"
  exit 1
}
ok "bun install --frozen-lockfile in a fresh clone"
(cd "$SRC" && bun run build:packages >/dev/null 2>&1) || {
  no "bun run build:packages"
  exit 1
}
ok "bun run build:packages"

mkdir -p "$WORK/packs"
for p in "${PUBLISHED[@]}"; do
  # ABSOLUTE path on purpose: `npm pack packages/core` is read as the GitHub
  # shorthand <user>/<repo> and npm goes to the network looking for
  # github.com/packages/core. A path npm can recognise as a path is required.
  (cd "$SRC" && npm pack "$SRC/packages/$p" --pack-destination "$WORK/packs" >/dev/null 2>&1) ||
    no "npm pack packages/$p"
done
packed=$(find "$WORK/packs" -name '*.tgz' | wc -l)
[ "$packed" -eq "${#PUBLISHED[@]}" ] &&
  ok "npm pack produced $packed tarballs" ||
  no "npm pack produced $packed tarballs, expected ${#PUBLISHED[@]}"

CONSUMER="$WORK/consumer"
mkdir -p "$CONSUMER" && (cd "$CONSUMER" && npm init -y >/dev/null 2>&1)
# react/react-dom are peers the consumer owns, exactly as a real app does.
if (cd "$CONSUMER" && npm install --no-audit --no-fund react@^19 react-dom@^19 "$WORK"/packs/*.tgz >/dev/null 2>&1); then
  ok "npm install of the tarballs into an empty project"
else
  no "npm install of the tarballs into an empty project"
fi

for p in core react; do
  if [ -d "$CONSUMER/node_modules/@docx-editor.dev/$p" ]; then
    v=$(node -p "require('$CONSUMER/node_modules/@docx-editor.dev/$p/package.json').version")
    ok "@docx-editor.dev/$p resolves ($v)"
  else
    no "@docx-editor.dev/$p resolves"
  fi
done

# Resolution is not usability: import both entry points for real.
cat >"$CONSUMER/import-check.mjs" <<'EOF'
const core = await import('@docx-editor.dev/core');
const react = await import('@docx-editor.dev/react');
const need = (mod, name, keys) => {
  const missing = keys.filter((k) => !(k in mod));
  if (missing.length) throw new Error(`${name} is missing exports: ${missing.join(', ')}`);
};
need(core, '@docx-editor.dev/core', ['createDocxEditor']);
need(react, '@docx-editor.dev/react', ['DocxEditor']);
console.log('imported both packages; core and react entry points expose their documented symbols');
EOF
if out=$(cd "$CONSUMER" && node import-check.mjs 2>&1); then
  ok "import of both packages under plain node ($out)"
else
  no "import of both packages under plain node"
  printf '        %s\n' "$(tail -3 <<<"$out")"
fi

printf '\nResults: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
