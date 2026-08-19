# FluentaOne fork of `eigenpal/docx-editor`

> This file is FluentaOne-specific. Do NOT submit it upstream.

This repository is the FluentaOne supply-chain mitigation per
[RFC-DOCEDIT-001](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/rfcs/RFC-DOCEDIT-001-in-platform-collaborative-document-editing.md) §6.1
and [SPIKE-DOCEDIT-001](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/spikes/SPIKE-DOCEDIT-001-eigenpal-evaluation.md).

## Why this fork exists

`flnt-svc-doc-edit` and `flnt-web-app` consume `@eigenpal/docx-editor-react`
as the RFC-DOCEDIT-001 v1 EditorPort adapter. The supply-chain mitigation
plan (RFC §6.1) requires that prd-bound builds consume a FluentaOne-owned
fork rather than the upstream npm tarball directly, so that:

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

## How to update from upstream

```bash
# 1. Sync the fork's main from upstream.
gh repo sync flnteu/docx-editor --source eigenpal/docx-editor

# 2. Tag the synced commit with the FluentaOne suffix.
git checkout main
git pull
git tag v<upstream>-flnteu
git push origin v<upstream>-flnteu

# 3. The `flnteu-supply-chain.yml` workflow runs on the tag.
#    It MUST be green before the tag becomes the FluentaOne private
#    registry source.
```

## Consumed by

- [`flnteu/flnt-svc-doc-edit`](https://github.com/flnteu/flnt-svc-doc-edit) (Node.js + Hocuspocus relay)
- [`flnteu/flnt-web-app`](https://github.com/flnteu/flnt-web-app) (React SPA — wires `@eigenpal/docx-editor-react` via `EigenpalEditorPort.tsx`)

Both consume the package via `git+ssh://git@github.com/flnteu/docx-editor.git#<tag>` (no internal npm registry needed in v1).

## Supplier-assessment review

The bus-factor / security / CLA / version-cadence review lives at
[`flnt-docs-central/architecture/spikes/SPIKE-DOCEDIT-001-supplier-assessment.md`](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/spikes/SPIKE-DOCEDIT-001-supplier-assessment.md).

The fork is the operational mitigation; the assessment is the
quarterly review that decides whether to keep, replace, or contribute
back to upstream.
