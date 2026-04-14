# Monaco Editor Integration Design

**Date:** 2026-04-14
**Status:** Approved

## Problem

Two pain points exist with the current editor stack:

1. **Git diff accuracy** — `diff2html` produces incorrect highlight ranges in some hunks (wrong characters highlighted). This is a rendering limitation of the library's HTML output, not a data problem.
2. **File editor ceiling** — CodeMirror 6 lacks IntelliSense, hover types, and the editing fluency users expect from a VS Code-grade tool. Write/edit support in the Files tab is limited.

## Goal

Replace CodeMirror 6 + diff2html with Monaco Editor across both the Files tab (read/write editing) and the Git tab (inline diff view). One editor runtime, accurate diffs, full editing experience.

## Architecture

### Single Monaco Environment

Monaco is initialised once at app startup in `main.ts` via a shared `initMonaco()` call. All editor instances share this environment. Theme is set globally via `monaco.editor.setTheme()`.

### Vite Worker Config

`vite-plugin-monaco-editor` is added to `vite.config.ts`. It handles bundling of Monaco's web workers (editor, TypeScript, JSON, HTML, CSS) as separate chunks. Only `editor.worker` loads upfront; language workers load lazily on first use.

### Components

#### `MonacoFileEditor.vue`

Replaces CodeMirror usage in the Files tab (within `FileSearchEditor.vue`).

- **Props:** `worktreePath: string`, `filePath: string`
- **On mount:** calls `files:read` IPC → populates Monaco model, auto-detects language from file extension via `monaco.languages.getLanguages()`
- **Save:** `Ctrl/Cmd+S` via `editor.addCommand()` → calls `files:write` IPC → emits `workingTreeFilesDidChange` to refresh the Git tab
- **Read-only:** auto-applied for binary files (null-byte check on read result)
- **No autosave:** explicit save only to avoid thrashing the git working tree

#### `MonacoDiffViewer.vue`

Replaces `diff2html` in `SourceControlPanel`.

- **Props:** `original: string`, `modified: string`, `language: string`
- **Data source:** `diff:fileDiff` IPC already returns raw content for both sides — passed directly as props
- **Render mode:** inline by default (`renderSideBySide: false`), toggleable to side-by-side
- **Read-only:** no editing in diff view

### Theme Sync

A composable `useMonacoTheme()` watches the dark/light class on `<html>` (the existing theme mechanism) and calls `monaco.editor.setTheme('vs-dark' | 'vs')`. No new theme infrastructure required.

## Migration

### Packages Removed

```
@codemirror/commands
@codemirror/lang-cpp
@codemirror/lang-css
@codemirror/lang-go
@codemirror/lang-html
@codemirror/lang-java
@codemirror/lang-javascript
@codemirror/lang-markdown
@codemirror/lang-python
@codemirror/lang-rust
@codemirror/lang-xml
@codemirror/view
(and any remaining @codemirror/* / @lezer/* packages)
diff2html
```

### Packages Added

```
monaco-editor
vite-plugin-monaco-editor
```

### Migration Order

1. Add `vite-plugin-monaco-editor` to `vite.config.ts` and verify worker chunks build correctly
2. Build `MonacoFileEditor.vue` + wire into Files tab (replace CodeMirror in `FileSearchEditor.vue`)
3. Build `MonacoDiffViewer.vue` + wire into `SourceControlPanel` (replace `diff2html` rendering)
4. Remove all CodeMirror/lezer imports and packages
5. Remove `diff2html`
6. Run `pnpm run verify:bundle-budget` to confirm budget is not exceeded

## Testing

- **`MonacoFileEditor`**: mount with mocked `files:read` IPC, assert model content set and language detected from extension; assert `files:write` called on Cmd+S
- **`MonacoDiffViewer`**: assert diff editor receives correct `original` / `modified` strings from `diff:fileDiff` IPC response
- Existing tests (`PreviewPanel.test.ts`, etc.) are unaffected

## Bundle Considerations

Monaco workers are lazy per language. Only `editor.worker` loads at startup. This keeps the initial chunk cost comparable to the current CodeMirror setup. In Electron, the total bundle ships inside the `.app` — user-perceived weight is not a concern; startup RAM is the metric to watch.

## Out of Scope

- LSP server integration (Monaco IntelliSense works off its built-in TypeScript worker; no external language server)
- Image or binary file preview (remains read-only with a placeholder message)
- Custom Monaco themes beyond `vs` / `vs-dark`
