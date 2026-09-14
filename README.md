<!-- ============================================================== -->
<!-- FluentaOne fork notice - keep this block on top when syncing   -->
<!-- from upstream; everything below it is upstream's README.       -->
<!-- ============================================================== -->

> [!IMPORTANT]
> **This is `flnteu/docx-editor`, FluentaOne's vendor fork of
> [`eigenpal/docx-editor`](https://github.com/eigenpal/docx-editor). It is not a
> development fork: no product code is written here.** Do not open feature PRs
> here; upstream contributions go to `eigenpal/docx-editor` and need their CLA.
>
> **Why it exists**, per
> [SPIKE-DOCEDIT-001](https://github.com/flnteu/flnt-docs-central/blob/main/architecture/spikes/SPIKE-DOCEDIT-001-eigenpal-evaluation.md)
> and RFC-DOCEDIT-001 section 6.1:
>
> 1. **Source escrow.** A copy of the source we depend on, in our own org, so we
>    can still build a patched version if upstream disappears, goes private, or
>    changes its license.
> 2. **Supply-chain gate.** `.github/workflows/flnteu-supply-chain.yml` audits
>    what we would ship: `bun audit` over the published-package dependency
>    closure (`.github/flnteu/audit-scope.mjs`), a license allowlist, a
>    reproducible build plus typecheck of `packages/*`, and an owner guard. It
>    must be green before a synced version becomes a FluentaOne source.
>
> **Synced to upstream 2.5.0**, tag `v2.5.0-flnteu` (DEV-2291). Upstream renamed
> the packages at 2.x: `@docx-editor.dev/core` and `@docx-editor.dev/react` were
> `@eigenpal/docx-editor-core` and `-react` before that.
>
> **What FluentaOne ships is older than this fork.** Measured 2026-09-14 on
> `flnt-web-app` `develop`: the docedit feature (document templates, the
> document-editor task view) imports `@eigenpal/docx-editor-react` **1.9.0**,
> installed from tarballs committed in `flnt-web-app/vendor/eigenpal/`, not from
> the public npm registry and not from this fork. No repo in the workspace
> depends on a `@docx-editor.dev/*` package, and `flnt-svc-doc-edit` does not
> embed the editor at all; it uses ProseMirror, Yjs and `docx` directly. Moving
> the web app to 2.x is a rename plus an API migration, not a version bump, and
> the private-registry end state named in RFC section 6.1 is not built yet.
>
> **Bun builds this repo; npm cannot.** Packages depend on each other with
> `workspace:*` and the lockfile is `bun.lock`. Measured here with npm 11.17.0:
> `npm install` stops at `ERESOLVE` on an eslint peer conflict, and with
> `--legacy-peer-deps` it stops at `EUNSUPPORTEDPROTOCOL Unsupported URL Type
> "workspace:"`. Use `bun install`. A git dependency on this repo fails for the
> same reason, so a consuming project takes packed tarballs instead:
> `bun run build:packages`, then `npm pack` each `packages/*` by absolute path.
> Re-run that evidence with `bash .github/flnteu/npm-consumability-probe.sh`.
>
> **Syncing an upstream bump** is a deliberate tree replacement, delivered as a
> branch and a PR, never a push to `main`. `gh repo sync` does not help: `main`
> carries the fork overlay, so it cannot fast-forward, and `--force` would erase
> that overlay. Take upstream's tree wholesale, re-apply the fork-local files on
> top of upstream's versions of them rather than replaying the old diff, tag
> `v<upstream-version>-flnteu`, and require the gate to be green before the tag
> becomes a FluentaOne source. The commands, and the tarball recipe for
> consumers, are in [FLNTEU-README.md](FLNTEU-README.md).
>
> **Fork-local files** are 18 paths against upstream v2.5.0 (`git diff
> --name-only c07574c3 HEAD`, measured 2026-09-14): this notice,
> `FLNTEU-README.md`, `.github/flnteu/` and `flnteu-supply-chain.yml`, `.claude/`
> (`CLAUDE.md`, moved here from the repo root, plus `settings.json`), owner
> guards or a repointed `runs-on` in five upstream workflows, audit `overrides`
> and `resolutions` in `package.json` with the matching `bun.lock`, and small
> edits to `.gitignore` and `CONTRIBUTING.md`. Everything else tracks upstream to
> keep syncs conflict-free, `.claude/skills/openspec-*` and
> `.claude/commands/opsx` included: those are upstream's own OpenSpec workflow,
> not FluentaOne scaffolding, and they stay.

<p align="center">
  <a href="https://www.docx-editor.dev/">
    <img src="./.github/assets/header.png" alt="DOCX Editor — .docx in, .docx out. Open source, agent ready, client-side." width="500" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@docx-editor.dev/core"><img src="https://img.shields.io/npm/v/@docx-editor.dev/core.svg?style=flat-square&color=3B5BDB" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@docx-editor.dev/core"><img src="https://img.shields.io/npm/dm/@docx-editor.dev/core.svg?style=flat-square&color=3B5BDB" alt="npm downloads" /></a>
  <a href="https://github.com/eigenpal/docx-editor/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue.svg?style=flat-square&color=3B5BDB" alt="license" /></a>
  <a href="https://docx-editor.dev/editor"><img src="https://img.shields.io/badge/Live_Demo-3B5BDB?style=flat-square&logo=vercel&logoColor=white" alt="Demo" /></a>
  <a href="https://www.docx-editor.dev/docs"><img src="https://img.shields.io/badge/Docs-3B5BDB?style=flat-square&logo=readthedocs&logoColor=white" alt="Documentation" /></a>
</p>

Open-source WYSIWYG `.docx` editor for React. Word-faithful pagination, tracked changes, comments — and **lossless round-trip**: untouched content and unsupported OOXML survive editing and save. **[Live demo](https://docx-editor.dev/editor)** | **[Documentation](https://www.docx-editor.dev/docs)**

## Quick Start

```bash
npm install @docx-editor.dev/react @docx-editor.dev/core
```

See the [React quick start](#react) below.

<p align="center">
  <a href="https://docx-editor.dev/editor">
    <img src="./.github/assets/editor.png" alt="docx-editor screenshot" width="100%" />
  </a>
</p>

## Nothing is lost

Open a document, edit one word, save it. Everything you did not touch survives: custom XML, embedded fonts, macros, media, Smart Tags, and markup from add-ins the editor has never heard of.

The mechanism is the canonical tree. Parsing types a node only where layout needs it and keeps everything else generic. On save, the tree serializes with structural fidelity and package payloads such as media, fonts, and VBA binaries pass through untouched. An element the parser cannot type — unknown, or known but in an invalid position — becomes a generic node instead of being dropped, so unrecognized markup never blocks editing.

CI checks this on a corpus of real documents with two oracles: a canonical fingerprint over the tree, and a semantic digest compared across save and reopen. A change that drops content fails the build.

## Packages

| Package                                                                                    | Description                                                                                                                                                                    | Docs                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [`@docx-editor.dev/react`](https://www.npmjs.com/package/@docx-editor.dev/react)           | <img src="https://cdn.simpleicons.org/react/61DAFB" width="20" align="middle" /> &nbsp; React adapter. Root component, provider primitives, shared hooks, and compound chrome. | [Docs](https://www.docx-editor.dev/docs/2.x/react)      |
| [`@docx-editor.dev/core`](https://www.npmjs.com/package/@docx-editor.dev/core)             | Framework-agnostic engine: OOXML read/write, canonical document tree, layout, paint. Depend on this if you fork the React adapter.                                             | [Docs](https://www.docx-editor.dev/docs/2.x/core)       |
| [`@docx-editor.dev/i18n`](https://www.npmjs.com/package/@docx-editor.dev/i18n)             | Shared locale strings and types consumed by the adapter.                                                                                                                       | [Docs](https://www.docx-editor.dev/docs/2.x/i18n)       |
| [`@docx-editor.dev/pro`](https://www.npmjs.com/package/@docx-editor.dev/pro)               | Tracked changes, comments, and custom nodes.                                                                                                                                   | [Docs](https://www.docx-editor.dev/docs/2.x/pro)        |
| [`@docx-editor.dev/editor-api`](https://www.npmjs.com/package/@docx-editor.dev/editor-api) | Office.js-compatible editing API: a batching object model that edits a document from a server, or an editor already open in a page.                                            | [Docs](https://www.docx-editor.dev/docs/2.x/editor-api) |

Every package above is Apache 2.0 except `@docx-editor.dev/editor-api` and `@docx-editor.dev/pro`, which are licensed under the EigenPal Pro Evaluation License 1.0 ([editor-api](packages/editor-api/LICENSE.md), [pro](packages/pro/LICENSE.md)): free to evaluate, production use requires a commercial agreement — **[licensing@eigenpal.com](mailto:licensing@eigenpal.com)**.

> **Forking the adapter?** Keep your fork thin. Depend on `@docx-editor.dev/core` directly so parser, serializer, and rendering fixes land in your build automatically, without backporting each upstream change by hand.

## React

```tsx
import { useState } from 'react';
import { DocxEditor } from '@docx-editor.dev/react';
import '@docx-editor.dev/core/styles/editor.css';

export function App() {
  const [doc, setDoc] = useState<Uint8Array>();

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <input
        type="file"
        accept=".docx"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setDoc(file ? new Uint8Array(await file.arrayBuffer()) : undefined);
        }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {doc && <DocxEditor document={doc} mode="edit" />}
      </div>
    </div>
  );
}
```

> **Next.js / SSR:** Use dynamic import. The editor requires the DOM.

Full docs: [`packages/react`](packages/react) · [API reference](https://www.docx-editor.dev/docs/props).

## Development

```bash
bun install
bun run dev        # localhost:5173
bun run build
bun run typecheck
```

A live preview of `main` is auto-deployed at **[latest.docx-editor.dev](https://latest.docx-editor.dev/)** — useful for trying out changes before they ship to npm.

Examples: [Vite](examples/vite) | [Next.js](examples/nextjs) | [Remix](examples/remix) | [Astro](examples/astro)

**[Documentation](https://www.docx-editor.dev/docs)** | **[Props & Ref Methods](https://www.docx-editor.dev/docs/props)** | **[Architecture](https://www.docx-editor.dev/docs/architecture)**

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the one-time CLA signature.

## Translations

| Locale  | Language             |
| ------- | -------------------- |
| `en`    | English              |
| `de`    | German               |
| `fr`    | French               |
| `he`    | Hebrew               |
| `hi`    | Hindi                |
| `id`    | Indonesian           |
| `pl`    | Polish               |
| `pt-BR` | Portuguese (Brazil)  |
| `tr`    | Turkish              |
| `zh-CN` | Chinese (Simplified) |

Help translate the editor into your language! See the full **[i18n contribution guide](docs/i18n.md)**.

```bash
bun run i18n:new de      # scaffold German locale
bun run i18n:status      # check translation coverage
```

## License

[Apache 2.0](LICENSE), except `packages/editor-api/` and `packages/pro/`, which are licensed under the EigenPal Pro Evaluation License 1.0 ([editor-api](packages/editor-api/LICENSE.md), [pro](packages/pro/LICENSE.md)). That licence permits internal, non-production evaluation; production use requires a written commercial agreement, available from **[licensing@eigenpal.com](mailto:licensing@eigenpal.com)**.

## Commercial Support

> [!TIP]
> Questions or custom features? Email **[docx-editor@eigenpal.com](mailto:docx-editor@eigenpal.com)**.
