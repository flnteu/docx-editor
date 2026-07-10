# @eigenpal/docx-editor-i18n

## 1.1.0

### Minor Changes

- a7f9ac5: Add French locale
- 42ea72d: Track structural edits as OOXML revisions in suggesting mode (fixes #614).

  Authoring:
  - Pressing Enter in suggesting mode marks the new paragraph break as
    tracked (`<w:pPr><w:rPr><w:ins/>`); Backspace at paragraph start marks
    the prior break as deleted (`<w:del/>`) without actually joining until
    accepted.
  - `addRowBelow` / `addRowAbove` / `deleteRow` in suggesting mode set
    `trIns` / `trDel` plus mirroring `cellMarker` on each cell instead of
    mutating the table structure.
  - Editing paragraph properties in suggesting mode records a `pPrChange`
    entry with the prior `ParagraphFormatting` snapshot.

  Round-trip preservation:
  - Paragraph-mark insertion / deletion (`<w:pPr><w:rPr><w:ins/></w:del/>`),
    paragraph property changes (`<w:pPrChange>`), table row insertion /
    deletion (`<w:trPr><w:ins/></w:del/>`), row property changes
    (`<w:trPrChange>`), cell insertion / deletion / merge
    (`<w:cellIns>`, `<w:cellDel>`, `<w:cellMerge>` with `w:vMerge` value
    preserved), cell property changes (`<w:tcPrChange>`), table property
    changes (`<w:tblPrChange>`) — all parse, round-trip, and re-emit per
    the ECMA-376 schema (CT_PPrBase containment for `*Change` previous
    snapshots, schema-mandated ordering, single `*Change` per parent,
    no `w:rsid` on `CT_TrackChange` extensions).

  Accept / Reject:
  - New commands `acceptChangeById(id)` / `rejectChangeById(id)` resolve
    any revision in one PM transaction. Per Word semantics: accept
    `pPrIns` clears the marker; reject joins-with-next (resulting
    paragraph inherits the second paragraph's `pPr`). Reject `pPrChange`
    restores the prior properties onto the paragraph.
  - `acceptAllChanges` / `rejectAllChanges` now resolve every revision
    type (inline marks, paragraph-mark, paragraph-property, row, cell,
    table-property), not just inline.

  Sidebar:
  - Existing TrackedChange sidebar surfaces every new revision type:
    paragraphMarkInsertion, paragraphMarkDeletion, paragraphPropertiesChanged,
    rowInserted, rowDeleted, rowPropertiesChanged, cellInserted, cellDeleted,
    cellMerged, cellPropertiesChanged, tablePropertiesChanged. Accept /
    Reject buttons route via `acceptChangeById` / `rejectChangeById`. React
    and Vue cards both i18n-localized (15 new `revisions.*` keys across
    all 7 locales). Multi-site revisions (row + N cells under one
    `(id, author, date)` triple) collapse to a single sidebar entry.

  Painter:
  - Pilcrow ¶ glyph at end of revised paragraphs (insertion green,
    deletion red strikethrough); vertical margin change-bar; colored
    row/cell borders for trIns/trDel/cellMarker; dashed boundary for
    unaccepted vertical cellMerge. Painter styles live in
    `@eigenpal/docx-editor-core/prosemirror/editor.css` and both adapters
    inherit (React + Vue parity).

  What's NOT yet covered (follow-up PRs):
  - `<w:sectPrChange>` (section property revisions)
  - `<w:rPr><w:rPrChange>` paragraph-mark formatting (CT_ParaRPrChange,
    distinct from run rPrChange)
  - `<w:moveFrom>` / `<w:moveTo>` round-trip
  - `<w:numPr><w:ins/>` (numbered-list assignment tracking)
  - Suggesting-aware `addColumnLeft` / `addColumnRight` / `deleteColumn`
    (TODOs in source reference the spec)
  - Agents-package surface for the new structural-revision fields
  - Collaboration / multi-author conflict semantics (single-user only)

  OOXML conformance audit, code review, and simplification pass have
  been folded back into this branch; see PR #616 for the per-phase
  review history.

### Patch Changes

- 14fe4f2: add Hindi (hi) community-maintained locale

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- fe4cb94: Add per-locale subpath imports to `@eigenpal/docx-editor-i18n` so dynamic
  locale loading can code-split a single locale instead of bundling the whole
  set:

  ```ts
  // Static — bundler ships only this locale's strings
  import pl from '@eigenpal/docx-editor-i18n/pl';

  // Dynamic — splits into its own chunk, loaded on demand
  const pl = (await import('@eigenpal/docx-editor-i18n/pl')).default;
  ```

  Subpaths ship for every locale: `/en`, `/de`, `/he`, `/pl`, `/pt-BR`, `/tr`,
  `/zh-CN`. The named exports on the package root still work — pick the
  ergonomic path for static lists, the subpath for runtime locale switching.

  Also re-export `createEmptyDocument`, `createDocumentWithText`, and
  `CreateEmptyDocumentOptions` from `@eigenpal/docx-editor-react` and
  `@eigenpal/docx-editor-vue` so the common "spawn a blank editor"
  affordance no longer requires installing `-core` alongside the adapter.

  Surface `Comment`, `CommentRangeStart`, `CommentRangeEnd`,
  `TrackedChangeInfo`, `TrackedRunChange`, `Insertion`, `Deletion`,
  `MoveFrom`, `MoveTo`, and `ParagraphContent` from the main
  `@eigenpal/docx-editor-core` entry. They were already public via
  `@eigenpal/docx-editor-core/headless`; the main entry just hadn't been
  re-exporting them.

## 1.0.0

### Major Changes

- 6272b32: # 1.0.0

  First multi-package, multi-framework release. The monolithic `@eigenpal/docx-js-editor` is split into a framework-agnostic core and per-framework adapters, Vue 3 ships as a first-class adapter alongside React, and the license moves to Apache 2.0 across all packages.

  ## Package restructure (breaking)

  | Old import                                 | New import                                |
  | ------------------------------------------ | ----------------------------------------- |
  | `@eigenpal/docx-js-editor`                 | `@eigenpal/docx-editor-react`             |
  | `@eigenpal/docx-js-editor/react`           | `@eigenpal/docx-editor-react`             |
  | `@eigenpal/docx-editor-react/core`         | `@eigenpal/docx-editor-core`              |
  | `@eigenpal/docx-editor-react/headless`     | `@eigenpal/docx-editor-core/headless`     |
  | `@eigenpal/docx-editor-react/core-plugins` | `@eigenpal/docx-editor-core/core-plugins` |
  | `@eigenpal/docx-editor-react/mcp`          | `@eigenpal/docx-editor-agents/mcp`        |
  | `@eigenpal/docx-editor-react/i18n/*.json`  | `@eigenpal/docx-editor-i18n/*.json`       |

  The old `@eigenpal/docx-js-editor` package stays on 0.x for legacy maintenance — no 1.x compatibility shim ships. Framework-agnostic utilities (e.g. `createEmptyDocument`) move to core:

  ```diff
  - import { DocxEditor, createEmptyDocument } from '@eigenpal/docx-js-editor';
  + import { DocxEditor } from '@eigenpal/docx-editor-react';
  + import { createEmptyDocument } from '@eigenpal/docx-editor-core';
  ```

  ## Vue 3 adapter (`@eigenpal/docx-editor-vue`)

  The Vue package becomes a real adapter (previously a stub). Public API mirrors React:
  - `<DocxEditor>` with matching prop surface
  - `useDocxEditor` composable + `renderAsync` for the Node.js path
  - `/ui`, `/composables`, `/dialogs`, `/plugin-api`, `/styles` subpaths

  Parity gates cover insert-table, find/replace, page-setup, context menus, image overlay (resize/move/rotate/aspect-locked corners, dimension tooltip), advanced cell/row options (margins, height rule, text direction, no-wrap), menu-bar icons + shortcuts + carets, toolbar pickers, and the agent UI surface.

  ## Shared i18n package (`@eigenpal/docx-editor-i18n`)

  Locale strings move out of `@eigenpal/docx-editor-react` into a dedicated package consumed by both adapters from a single source.

  ```diff
  - import de from '@eigenpal/docx-editor-react/i18n/de.json';
  + import de from '@eigenpal/docx-editor-i18n/de.json';
  ```

  The `defaultLocale` value (English) is still re-exported from the adapter packages, unchanged.

  ## Agent UI relocation (breaking)

  `AgentPanel`, `AgentChatLog`, `AgentComposer`, `AgentSuggestionChip`, `AgentTimeline` no longer ship from `@eigenpal/docx-editor-react`. They live at:
  - `@eigenpal/docx-editor-agents/react` — React components + `useAgentChat`
  - `@eigenpal/docx-editor-agents/vue` — Vue 3 twins, plus `AIContextMenu` and `AIResponsePreview`
  - `@eigenpal/docx-editor-agents/ai-sdk/react` / `/ai-sdk/vue` — `@ai-sdk/*` adapters
  - `@eigenpal/docx-editor-agents/bridge` — React-free `createEditorBridge`, `agentTools`, `executeToolCall`, `getToolSchemas`, `createReviewerBridge`. Safe for headless / Vue / Node.

  ```diff
  - import { AgentPanel, AgentChatLog } from '@eigenpal/docx-editor-react';
  + import { AgentPanel, AgentChatLog } from '@eigenpal/docx-editor-agents/react';
  ```

  The agent components no longer call `useTranslation` directly — pass localized `*Label` props instead. `<DocxEditor>`'s built-in agent panel slot still forwards localized strings automatically.

  Accessibility polish on the agent surface: keyboard-operable resize handle, Escape-dismissable context menu, live-region chat log, WCAG AA contrast on response previews.

  ## Toolbar naming unified (breaking)

  The standalone formatting bar is `Toolbar` on both adapters. The old "classic" single-row `Toolbar` (with File/Format/Insert menus baked in) is removed — compose `EditorToolbar.MenuBar` + `EditorToolbar.Toolbar` for that layout.

  | Old (React)                    | New (React + Vue)       |
  | ------------------------------ | ----------------------- |
  | `FormattingBar`                | `Toolbar`               |
  | Classic `Toolbar` (with menus) | `EditorToolbar`         |
  | `EditorToolbar.FormattingBar`  | `EditorToolbar.Toolbar` |

  Vue: `BasicToolbar` / `FormattingBar` aliases removed; `EditorToolbar`'s `formatting-bar` slot is now `toolbar`. Vue's table border-color and cell-fill pickers now use the advanced color picker matching React. Vue `MenuDropdown`'s `showChevron` default flips from `true` to `false` — pass `:show-chevron="true"` explicitly to keep the caret.

  ## `showPrintButton` prop removed (breaking)

  Removed from `<DocxEditor>` and `<Toolbar>` on both adapters; the Vue `<Toolbar>` `print` event is gone with it. `onPrint` callback stays.

  ```diff
  - <DocxEditor showPrintButton onPrint={handlePrint} />
  + <DocxEditor onPrint={handlePrint} />
  ```

  To hide File > Print, omit `onPrint`. Programmatic print still works via `ref.current.print()` / `editorRef.value.print()`.

  ## License moves to Apache 2.0

  All published packages relicense to Apache 2.0. Notably: `@eigenpal/docx-editor-agents` was AGPL-3.0-or-later — the relicense lifts copyleft obligations on agent embedders.

### Patch Changes

- 6b8f1fb: Fill in the last 26 untranslated keys in `de`, `he`, `pl`, `pt-BR`, `tr`, and `zh-CN`. All six community locales now reach 100% coverage against `en.json`.
