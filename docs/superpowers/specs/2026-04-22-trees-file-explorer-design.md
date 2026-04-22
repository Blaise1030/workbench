# File Explorer: @pierre/trees Integration Design

**Date:** 2026-04-22
**Status:** Approved

## Overview

Replace the existing custom file tree (`FileTreeNode.vue` + the tree-rendering section of `FileSearchEditor.vue`) with `@pierre/trees` (vanilla API). The replacement preserves all existing user-facing behaviour: opening files in Monaco editor tabs, attaching files to the agent context queue, git status decorations, in-tree drag-and-drop file moves, and fuzzy search.

## Architecture

Two new files. Two files deleted.

### New: `composables/useFileTree.ts`

Owns the vanilla `FileTree` instance lifecycle and all tree model concerns.

**Signature:**
```ts
useFileTree(
  workspacePath: Ref<string>,
  paths: Ref<string[]>
): {
  containerRef: Ref<HTMLDivElement | null>
  setSearch: (value: string) => void
  selectedPath: Ref<string | null>
}
```

**Lifecycle:**
- `onMounted`: constructs `new FileTree({ ... })` and calls `tree.render({ fileTreeContainer: containerRef.value })`
- `onUnmounted`: calls `tree.cleanUp()`

**Git status:**
- Watches `useScmStore` (modified, added, deleted, untracked file path arrays)
- Maps to `[{ path: string, status: 'M' | 'A' | 'D' | '?' }]`
- Calls `tree.setGitStatus(mapped)` reactively on every store change
- No additional IPC needed — reuses the store's existing data

**Search:**
- Exposes `setSearch(value)` which delegates to `tree.setSearch(value)` with mode `hide-non-matches`
- The component owns the debounce (150ms); the composable only delegates

**Drag and drop:**
- Enabled via `dragAndDrop: { canDrag, canDrop, onDropComplete, onDropError }`
- `onDropComplete({ draggedPaths, destination })` → calls IPC `moveFile(from, to)` for each path → on success calls `tree.move(from, to)`
- On IPC error: skips `tree.move()`, shows a toast via `useToast`

**Path refresh:**
- Watches the `paths` prop; on change calls `tree.resetPaths(newPaths)` — no full remount

**Context menu:**
- Passed as `composition.contextMenu.render(item, context)` in the `FileTree` constructor
- Returns a DOM element with two actions: "Open file" and "Attach to context"
- Callbacks reference stable functions passed in at construction time (no closure mutation)
- Library owns positioning, right-click trigger, and dismiss behaviour

### New: `components/FileExplorerPanel.vue`

Thin mount-point component. No tree logic.

**Template:**
```
FileExplorerPanel
├── <input>  — search, debounced 150ms → setSearch()
└── <div ref="containerRef">  — trees mounts here
```

**Wiring:**
- Imports `useFileTree`, passes `workspacePath` and `paths` from IPC
- `onSelect` path → calls existing `openSelectedFilePath` (Monaco tab open)
- Context menu "Attach to context" → calls existing `queueForAgent(path)`
- Monaco tab state (`openTabPaths`) and selected path localStorage persistence move here from `FileSearchEditor.vue`

### Deleted: `components/FileTreeNode.vue`

Removed entirely. All tree rendering is handled by `@pierre/trees`.

### Modified: `FileSearchEditor.vue`

The tree-rendering section, `FileTreeNode` import, and all search filtering logic are stripped out. The following move to `FileExplorerPanel.vue`: Monaco tab state (`openTabPaths`), selected path localStorage persistence, and context queue popup. What remains in `FileSearchEditor.vue` (if anything) is only the Monaco editor surface itself — if it only contained the tree + editor, it can be deleted entirely and `FileExplorerPanel.vue` becomes the panel entry point.

## Data Flow

```
IPC file list (initial)
  → paths Ref<string[]>
  → useFileTree → prepareFileTreeInput(paths) → FileTree constructor

IPC file list (subsequent update)
  → paths Ref<string[]> watcher fires
  → tree.resetPaths(newPaths)

useScmStore (changedFiles, addedFiles, deletedFiles, untrackedFiles)
  → map to { path, status }[]
  → tree.setGitStatus()

User types in search <input>
  → debounce 150ms
  → setSearch(value)
  → tree.setSearch() [mode: hide-non-matches]

User clicks file
  → onSelect(path)
  → openSelectedFilePath(path) → Monaco tab

User right-clicks file
  → composition.contextMenu.render fires
  → "Open file" → openSelectedFilePath(path)
  → "Attach to context" → queueForAgent(path)

User drags file
  → dragAndDrop.onDropComplete({ draggedPaths, destination })
  → IPC moveFile(from, to)
  → tree.move(from, to)
```

## Installation

```
pnpm add @pierre/trees
```

No React dependency needed — vanilla entry point only.

## Error Handling

- **Drag/drop IPC failure**: toast shown, `tree.move()` not called (tree stays consistent with disk)
- **Path refresh**: `tree.resetPaths()` is idempotent; no error state needed
- **Git status mapping**: if `useScmStore` returns undefined/null paths, skip `setGitStatus()` call silently

## Testing

- `useFileTree` unit tests: mock `FileTree` class, verify `setGitStatus` called on store change, verify `cleanUp` called on unmount
- `FileExplorerPanel` component test: verify search input debounce calls `setSearch`, verify `onSelect` calls `openSelectedFilePath`
- No tests for `FileTreeNode.vue` to migrate (it is deleted)
