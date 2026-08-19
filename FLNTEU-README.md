# FluentaOne fork of `eigenpal/docx-editor`

> This file is FluentaOne-specific. Do NOT submit it upstream.

This repository is the FluentaOne supply-chain mitigation per
[RFC-DOCEDIT-001](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/rfcs/RFC-DOCEDIT-001-in-platform-collaborative-document-editing.md) §6.1
and [SPIKE-DOCEDIT-001](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/spikes/SPIKE-DOCEDIT-001-eigenpal-evaluation.md).

## Why this fork exists

`flnt-svc-doc-edit` and `flnt-web-app` consume `@docx-editor.dev/react`
(renamed from `@eigenpal/docx-editor-react` upstream at 2.0) as the
RFC-DOCEDIT-001 v1 EditorPort adapter. The supply-chain mitigation plan
(RFC §6.1) requires that prd-bound builds consume a FluentaOne-owned fork
rather than the upstream npm tarball directly, so that:

- A new upstream version cannot land in our build without an internal
  security + license + build gate (see `.github/workflows/flnteu-supply-chain.yml`).
- A compromised upstream maintainer account cannot push a malicious
  patch into a FluentaOne deploy.
- We have a permanent, internal-CI-blessed source even if upstream is
  unpublished, deleted, or licensed-changed.

## What this fork does NOT do

- It does not change the editor's behaviour.
- It does not strip eigenpal attribution — Apache-2.0 NOTICE / LICENSE
  preserved verbatim.
- It does not host FluentaOne-specific patches. Internal patches, if
  needed, live on a separate branch (`flnteu-patches`) and are reviewed
  per RFC §6 before being applied to a published tag.

## Fork-local files

Everything else tracks upstream byte-for-byte, so syncs stay conflict-free.

| Path                                                     | What it is                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `FLNTEU-README.md`                                       | this file                                                  |
| `README.md`                                              | upstream's, with the fork notice prepended                 |
| `.github/workflows/flnteu-supply-chain.yml`              | the vendor gate                                            |
| `.github/flnteu/`                                        | the gate's scoping filter, its tests, and this doc's probe |
| `.claude/CLAUDE.md`, `.claude/settings.json`             | agent config (DEV-1218)                                    |
| `.github/workflows/cla.yml`                              | upstream's, plus a fork owner guard                        |
| `.github/workflows/bench.yml`, `office-compat-drift.yml` | upstream's, plus a fork owner guard                        |
| `.github/workflows/ci.yml`, `dependabot-lockfile.yml`    | upstream's, with `runs-on` repointed                       |
| `package.json` `overrides` / `resolutions`               | audit remediation, documented in the gate                  |

Two of those need a word of explanation.

**`runs-on` is repointed.** Upstream runs CI on `blacksmith-4vcpu-ubuntu-2404`.
flnteu has no Blacksmith and no self-hosted runners — `gh api
repos/flnteu/docx-editor/actions/runners` and the org equivalent both return
`total_count: 0` — so inheriting that label verbatim gives jobs that queue
forever instead of failing: a PR check that is permanently pending. The fork's
gate workflows therefore say `ubuntu-latest`. Upstream tooling that cannot work
here for other reasons (the benchmark needs a meaningful merge base; the
office-compat drift job needs Eigenpal's App secrets) is skipped by an owner
guard instead, the same one `cla.yml` has carried since DEV-1218.

**Do not "fix" the sync conflict on those lines by accepting upstream's side.**
That silently restores a runner the fork does not have.

## Syncing to a new upstream version

**`gh repo sync` does not work on this fork, and adding `--force` would
destroy it.** Upstream re-initialized its git history on 2026-07-20 (its
current root commit is `chore: initialize repository`; the fork's descends from
a 2026-02-01 root). The two repositories share no commit:

```bash
git merge-base origin/main upstream/main; echo $?   # -> 1, no common ancestor
```

So a sync is a deliberate tree replacement, delivered as a branch and a PR —
never a push to `main`:

```bash
# 0. One-time: add the upstream remote.
git remote add upstream https://github.com/eigenpal/docx-editor.git
git fetch upstream --tags

# 1. Identify the release commit. Upstream tags each published package
#    separately; they all point at one commit, and `vX.Y.Z` is the alias.
git rev-parse '@docx-editor.dev/react@2.5.0^{commit}'

# 2. Branch from the fork's main and take upstream's tree wholesale,
#    keeping BOTH histories as parents so the PR still has a merge base.
git switch -c sync/DEV-XXXX-upstream-2.5.x origin/main
git merge --allow-unrelated-histories --no-commit -s ours v2.5.0
git read-tree --reset -u v2.5.0        # tree := upstream's, exactly
git commit                              # parents: fork main + upstream tag

# 3. Re-apply the fork-local files listed above, ON TOP of upstream's
#    versions of the files they modify — never by replaying the old diff,
#    which would revert upstream's changes to CLAUDE.md, cla.yml and README.
# 4. Open a DRAFT PR to main. Do not force-push main, ever.
# 5. Tag the branch tip and push the tag to run the vendor gate:
git tag v2.5.0-flnteu && git push origin v2.5.0-flnteu
```

Step 5's gate must be green before the tag becomes a FluentaOne source.

## Consuming a tagged fork build from npm

**A plain git dependency cannot work, and prebuilt `dist/` would not rescue
it.** Measured 2026-08-19 (DEV-2291) — re-run it yourself with
`bash .github/flnteu/npm-consumability-probe.sh`:

```
npm install git+ssh://git@github.com/flnteu/docx-editor.git#v2.5.0-flnteu
  -> npm error code EUNSUPPORTEDPROTOCOL
     Unsupported URL Type "workspace:": workspace:*
```

npm clones the repo and runs the root `prepare` script, which is a Bun
workspace install; npm has never supported the `workspace:` protocol. That is
only the first wall. Removing `prepare` and the `workspaces` array to get past
it makes the install SUCCEED and still leaves you with nothing usable: what
lands in `node_modules` is `docx-editor-monorepo`, the private root package.
No `@docx-editor.dev/*` scope appears at all, because npm installs the package
at the repository ROOT and has no subdirectory support for git URLs. The
packages we want live in `packages/*`, so no amount of committed build output
changes the verdict.

**The supported path is packed tarballs**, which is also what upstream's own
`bun run check:consumer-install` exercises in CI:

```bash
git clone --branch v2.5.0-flnteu git@github.com:flnteu/docx-editor.git
cd docx-editor
bun install --frozen-lockfile
bun run build:packages
# ABSOLUTE paths: `npm pack packages/core` is read as the GitHub shorthand
# <user>/<repo> and goes to the network.
for p in core i18n fonts react editor-api pro; do
  npm pack "$PWD/packages/$p" --pack-destination /tmp/flnteu-docx-packs
done

# In the consuming project (react/react-dom stay the consumer's own peers):
npm install react@^19 react-dom@^19 /tmp/flnteu-docx-packs/*.tgz
```

Verified end to end on `v2.5.0-flnteu`: six tarballs pack, install into an
empty npm project, and `@docx-editor.dev/core@2.5.0` and
`@docx-editor.dev/react@2.5.0` both resolve and import under plain node with
`createDocxEditor` and `DocxEditor` present.

Note the division of labour this implies, and keep it: **bun builds the fork,
npm consumes the tarballs.** Nothing asks npm to understand the monorepo.

For a repeatable prd path the tarballs belong in a registry rather than in a
developer's `/tmp` — publishing the gate-green tag's tarballs to a FluentaOne
private registry is the RFC §6.1 end state, and this probe is the evidence that
the artifacts themselves are sound.

## Consumed by

- [`flnteu/flnt-svc-doc-edit`](https://github.com/flnteu/flnt-svc-doc-edit) (Node.js + Hocuspocus relay)
- [`flnteu/flnt-web-app`](https://github.com/flnteu/flnt-web-app) (React SPA — wires the editor via `EigenpalEditorPort.tsx`)

Earlier revisions of this file told both repos to depend on
`git+ssh://git@github.com/flnteu/docx-editor.git#<tag>` directly, "no internal
npm registry needed in v1". That instruction never worked for the reason
measured above; use the tarball recipe.

## Supplier-assessment review

The bus-factor / security / CLA / version-cadence review lives at
[`flnt-docs-central/architecture/spikes/SPIKE-DOCEDIT-001-supplier-assessment.md`](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/spikes/SPIKE-DOCEDIT-001-supplier-assessment.md).

The fork is the operational mitigation; the assessment is the
quarterly review that decides whether to keep, replace, or contribute
back to upstream.
