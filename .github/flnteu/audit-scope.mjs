// FluentaOne supply-chain gate — scope `bun audit` findings to the
// published-package dependency closure (DEV-1218).
//
// Why: `bun audit` has no scope flag — it audits every package resolved in
// bun.lock, including the 10 upstream examples/* demo apps (next, nuxt,
// remix, astro, ...). Nothing from those demos is built, published, or
// served to FluentaOne (the reproducible-build job builds packages/* only),
// yet historically they contributed nearly all of the audit findings. This
// filter keeps the gate strict for what we actually ship while making demo
// noise non-blocking.
//
// Scope = the transitive dependency closure, per the committed bun.lock, of:
//   - every PUBLISHED packages/* workspace, i.e. one whose package.json is
//     not `private: true` (dependencies + devDependencies + peerDependencies
//     — devDeps included on purpose: the build toolchain that produces the
//     published artifacts is supply-chain surface), and
//   - the root workspace's devDependencies (shared build/release tooling:
//     tsup, typescript, eslint, changesets, ...).
// examples/* workspaces are excluded — that is the point — and so are
// private packages/* workspaces, for the same reason and with the same
// caveats; see the seed section below (DEV-2291).
//
// The graph walk is name-level and therefore conservative: if ANY resolved
// copy of a name is reachable, every advisory for that name stays blocking.
//
// Usage:
//   bun audit --json > audit.json || true
//   bun .github/flnteu/audit-scope.mjs audit.json bun.lock [--ignore=GHSA-...]...
//
// Exit 1 iff an in-scope high/critical advisory is not on the ignore list.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const ignores = new Set(
  args.filter((a) => a.startsWith('--ignore=')).map((a) => a.slice('--ignore='.length)),
);
const [auditPath, lockPath] = args.filter((a) => !a.startsWith('--'));
if (!auditPath || !lockPath) {
  console.error('usage: audit-scope.mjs <audit.json> <bun.lock> [--ignore=GHSA-...]...');
  process.exit(2);
}

// bun.lock is JSONC (trailing commas). Strip them; the file contains no
// comments and no string literal ever ends with `,` directly before a
// closing bracket on the next line, so this regex is safe here.
const lock = JSON.parse(readFileSync(lockPath, 'utf8').replace(/,(\s*[}\]])/g, '$1'));
const audit = JSON.parse(readFileSync(auditPath, 'utf8') || '{}');

// --- Build the name-level dependency graph from the lock ------------------
// lock.packages values: ["name@version", registry, { dependencies?,
// devDependencies?, peerDependencies?, optionalDependencies? }, sha]
const edges = new Map(); // realName -> Set(dep names)
for (const entry of Object.values(lock.packages ?? {})) {
  const spec = entry[0]; // "name@version" (name may be @scoped)
  const realName = spec.slice(0, spec.lastIndexOf('@'));
  const meta = entry[2] ?? {};
  const deps = { ...(meta.dependencies ?? {}), ...(meta.optionalDependencies ?? {}) };
  const set = edges.get(realName) ?? new Set();
  for (const dep of Object.keys(deps)) set.add(dep);
  edges.set(realName, set);
}

// --- Seed: PUBLISHED packages/* workspaces + root build tooling -------------
//
// "published" is read from each workspace's own package.json `private` flag,
// not from a hand-maintained list here — a list would silently rot the next
// time upstream adds a package (DEV-2291).
//
// Why the flag matters (measured on upstream 2.5.0): `packages/nuxt` and
// `packages/vue` are `private: true`. They are WIP adapters that are never
// published to npm and are deliberately excluded from the repo's own
// `build:packages` script — the very script the reproducible-build job runs.
// But `packages/nuxt` devDepends on the whole Nuxt framework, which dragged
// 17 high/critical advisories into what this script calls the
// "published-package closure", including ALL THREE criticals
// (@nuxt/devtools RPC RCE, shell-quote, node-tar). None of it can reach a
// FluentaOne artifact: it is not built, not published, and not installed by
// any consumer of this fork.
//
// Blocking the vendor gate on a dev-only framework inside an unpublished WIP
// workspace is the "gate blocks on risk that never ships" failure this
// script exists to fix — the examples/* case, one directory over. Scoping to
// the packages that are actually published makes the gate's name true.
//
// This NARROWS the scope, so it is a deliberate weakening in exchange for a
// gate that people act on. Two things keep it honest:
//   - devDependencies of published packages stay in scope (unchanged): the
//     toolchain that produces a published artifact is supply-chain surface.
//   - the scope is asserted, not assumed —
//     `.github/flnteu/audit-scope.test.mjs` fails if a private workspace
//     stops being excluded, if a published one stops being included, or if
//     the script stops failing on an in-scope high (the positive control).
const seeds = new Set();
const workspaceNames = new Set();
const skippedPrivate = [];
for (const [wsPath, ws] of Object.entries(lock.workspaces ?? {})) {
  if (ws.name) workspaceNames.add(ws.name);
  if (wsPath !== '' && !wsPath.startsWith('packages/')) continue; // drop examples/*
  if (wsPath !== '' && isPrivateWorkspace(wsPath)) {
    skippedPrivate.push(wsPath);
    continue; // drop private (never-published) packages/* workspaces
  }
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(ws[key] ?? {})) seeds.add(dep);
  }
}

// Reads the workspace's package.json relative to the lockfile's directory, so
// the script works from any cwd. A workspace whose manifest cannot be read is
// treated as PUBLISHED (fail closed: keep it in scope).
function isPrivateWorkspace(wsPath) {
  try {
    const manifest = join(dirname(resolve(lockPath)), wsPath, 'package.json');
    return JSON.parse(readFileSync(manifest, 'utf8')).private === true;
  } catch {
    return false;
  }
}

// --- BFS -------------------------------------------------------------------
const inScope = new Set();
const queue = [...seeds].filter((n) => !workspaceNames.has(n));
while (queue.length) {
  const name = queue.pop();
  if (inScope.has(name)) continue;
  inScope.add(name);
  for (const dep of edges.get(name) ?? []) {
    if (!inScope.has(dep) && !workspaceNames.has(dep)) queue.push(dep);
  }
}

// --- Evaluate audit findings ------------------------------------------------
const BLOCKING = new Set(['high', 'critical']);
const ghsaOf = (adv) => adv.url?.match(/GHSA-[a-z0-9-]+/)?.[0] ?? adv.url ?? 'unknown-advisory';
const rows = { blocking: [], ignored: [], outOfScope: [] };
for (const [pkg, advisories] of Object.entries(audit)) {
  for (const adv of advisories) {
    if (!BLOCKING.has(adv.severity)) continue;
    const row = `${pkg} ${adv.severity} ${ghsaOf(adv)} — ${adv.title}`;
    if (!inScope.has(pkg)) rows.outOfScope.push(row);
    else if (ignores.has(ghsaOf(adv))) rows.ignored.push(row);
    else rows.blocking.push(row);
  }
}

console.log(`published-package closure: ${inScope.size} packages (of ${edges.size} in bun.lock)`);
console.log(
  skippedPrivate.length
    ? `excluded, private:true so never published: ${skippedPrivate.join(', ')}`
    : 'excluded, private:true so never published: (none)',
);
for (const [label, list] of [
  ['BLOCKING (in scope)', rows.blocking],
  ['ignored (in scope, on the documented ignore list)', rows.ignored],
  ['informational (examples/* + private workspaces, not shipped)', rows.outOfScope],
]) {
  console.log(`\n${label}: ${list.length}`);
  for (const r of list) console.log(`  ${r}`);
}

if (rows.blocking.length) {
  console.error('\nFAIL: high/critical advisories inside the published-package closure.');
  process.exit(1);
}
console.log('\nOK: no unignored high/critical advisories inside the published-package closure.');
