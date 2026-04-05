# File search editor — Design spec

**Date:** 2026-04-06  
**Status:** Draft (approved in chat, pending implementation)

## Problem

The workspace shell has terminals and diff review, but no fast way to search for files in the repo the user is currently working in, open one, inspect it, and make a quick plain-text edit without leaving the app.

## Goals

- Search only within the currently active worktree path.
- Return relative file paths quickly enough for interactive filtering.
- Open a selected text file in a read/write plain-text editor.
- Support full-file save and revert without syntax highlighting.
- Guard against silent data loss when a file has unsaved changes.
- Keep file access inside Electron IPC rather than exposing direct filesystem access to the renderer.

## Non-goals

- Cross-project or cross-worktree search.
- Directory tree browsing.
- Syntax highlighting, code intelligence, or formatting.
- Multi-file tabs.
- Binary editing.
- Background file watching or merge conflict resolution.

## User experience

Add a `Files` tab to the center panel alongside `Agent`, `Git Diff`, and shell tabs.

Inside that tab:

- **Left pane:** search input plus matching file paths.
- **Right pane:** plain-text editor for the selected file.

Behavior:

- No active worktree: show an inactive empty state.
- Empty query: show instructional empty state instead of listing the whole repo.
- Search input updates results after a short debounce.
- Clicking a result opens that file in the editor.
- Selecting a different result while dirty prompts for confirmation.
- Changing active worktree resets the panel and also guards against dropping unsaved edits silently.
- `Save` writes the full editor content back to disk.
- `Revert` reloads the file from disk and clears dirty state.
- Unreadable or non-text files show a local error state instead of opening in the editor.

## Search rules

- Scope all operations to the active worktree root.
- Return relative paths only.
- Ignore noisy directories:
  - `node_modules`
  - `.git`
  - `dist`
  - `dist-electron`
- v1 matching can be simple case-insensitive substring matching on the relative path.
- v1 does not need fuzzy ranking or content search.

## Security and path handling

- The renderer passes the active worktree root and requested relative path through IPC.
- Main-process handlers resolve the path and reject any request that escapes the root.
- File reads and writes only operate on regular text files under that root.
- Writes replace the full file content in one operation.

## Architecture

**Chosen approach:** dedicated `FileSearchEditor` renderer component backed by a new Electron `FileService`.

```text
WorkspaceLayout
  -> center tab = "files"
  -> FileSearchEditor(worktreePath)
       -> preload workspaceApi.searchFiles(cwd, query)
       -> preload workspaceApi.readFile(cwd, relativePath)
       -> preload workspaceApi.writeFile(cwd, relativePath, content)

preload
  -> IPC channels

main
  -> FileService
       -> validate root-relative access
       -> search repo files
       -> read text file
       -> write text file
```

## Data model

Renderer-local state is sufficient:

- `query`
- `results`
- `selectedPath`
- `loadedContent`
- `draftContent`
- `dirty`
- `loading`
- `saving`
- `error`

No Pinia store is required for v1 because the panel is scoped to the active worktree and one open file.

## Error handling

- Search failure: show local error in the file panel.
- Read failure: show error in the editor pane and keep previous draft untouched unless the user explicitly discarded it.
- Write failure: preserve the draft and show local error.
- Binary / invalid UTF-8 / oversized files: show “cannot open as text” style messaging.

## Testing

- Unit tests for `FileService`:
  - search ignores excluded directories
  - search returns relative paths
  - reads reject escaping the root
  - writes reject escaping the root
  - read/write happy path for a text file
- Component tests for `FileSearchEditor`:
  - empty state with no query
  - result rendering after search
  - selecting a result loads content
  - editing marks dirty
  - save calls IPC and clears dirty
  - revert restores loaded content
  - dirty-file confirmation when switching files

## References

- Center tab shell: `src/layouts/WorkspaceLayout.vue`
- Electron bridge: `electron/preload.ts`, `electron/main.ts`
- Existing service pattern: `electron/services/diffService.ts`
- Renderer typings: `src/env.d.ts`
