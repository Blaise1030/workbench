# File Search Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Files` center tab that searches the active worktree, opens a selected file, and supports plain-text full-file save/revert through Electron IPC.

**Architecture:** A new main-process `FileService` handles scoped search/read/write under the active worktree root, exposed through preload IPC methods. The renderer uses a focused `FileSearchEditor` component with local state for query, results, current file, draft content, and dirty guarding.

**Tech Stack:** Vue 3, Electron IPC, Node `fs/promises`, Vitest, Vue Test Utils.

**Spec:** `docs/superpowers/specs/2026-04-06-file-search-editor-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `electron/services/fileService.ts` | Search/read/write logic scoped to a worktree root |
| `electron/services/__tests__/fileService.test.ts` | Unit tests for path validation and file operations |
| `src/shared/ipc.ts` | File IPC channel names and payload/result types |
| `electron/preload.ts` | Expose file APIs to the renderer |
| `electron/main.ts` | Register file IPC handlers |
| `src/env.d.ts` | Extend `WorkspaceApi` types |
| `src/components/FileSearchEditor.vue` | Search UI, results list, text editor, save/revert flow |
| `src/components/__tests__/FileSearchEditor.test.ts` | Component tests for panel behavior |
| `src/layouts/WorkspaceLayout.vue` | Add `Files` center tab and mount component |
| `src/layouts/__tests__/WorkspaceLayout.test.ts` | Adjust layout tests for the new component surface if needed |

---

### Task 1: Electron file service with failing tests first

**Files:**
- Create: `electron/services/fileService.ts`
- Create: `electron/services/__tests__/fileService.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- search returns relative matches under the root
- search skips `node_modules`, `.git`, `dist`, and `dist-electron`
- `readFile` rejects paths outside the root
- `writeFile` rejects paths outside the root
- `readFile` returns UTF-8 text for a regular file
- `writeFile` overwrites a file and persists the new contents

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `npm test -- electron/services/__tests__/fileService.test.ts`  
Expected: FAIL because `fileService` does not exist yet

- [ ] **Step 3: Implement the minimal service**

Implement:
- safe root-relative path resolution
- recursive search with ignore-directory filtering
- case-insensitive path substring match
- UTF-8 text read
- full-file write

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run: `npm test -- electron/services/__tests__/fileService.test.ts`  
Expected: PASS

---

### Task 2: IPC contract and preload bridge

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add file IPC channels and types**

Add channels for:
- `files:search`
- `files:read`
- `files:write`

Use typed payloads for read/write requests.

- [ ] **Step 2: Expose preload methods**

Add:
- `searchFiles(cwd, query)`
- `readFile(cwd, relativePath)`
- `writeFile(cwd, relativePath, content)`

- [ ] **Step 3: Register main handlers**

Instantiate `FileService` in `electron/main.ts` and wire IPC handlers.

- [ ] **Step 4: Run a targeted type-aware verification**

Run: `npm run typecheck`  
Expected: typecheck remains green or only fails in yet-unimplemented renderer code

---

### Task 3: File search editor component with failing tests first

**Files:**
- Create: `src/components/FileSearchEditor.vue`
- Create: `src/components/__tests__/FileSearchEditor.test.ts`

- [ ] **Step 1: Write the failing component tests**

Cover:
- empty query message
- entering a query triggers search
- clicking a result loads file contents
- editing marks the file dirty
- save writes content and clears dirty state
- revert restores loaded content
- switching files while dirty asks for confirmation

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `npm test -- src/components/__tests__/FileSearchEditor.test.ts`  
Expected: FAIL because component does not exist yet

- [ ] **Step 3: Implement the minimal component**

Use local refs for:
- `query`
- `results`
- `selectedPath`
- `loadedContent`
- `draftContent`
- `dirty`
- `loading`
- `saving`
- `error`

Include:
- debounced search
- results list
- plain textarea editor
- `Save` and `Revert` buttons
- dirty confirmation on file switch

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run: `npm test -- src/components/__tests__/FileSearchEditor.test.ts`  
Expected: PASS

---

### Task 4: Layout integration

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Add the `Files` center tab**

Insert `files` into `centerPanelTabs` and keep existing terminal/diff behavior intact.

- [ ] **Step 2: Mount `FileSearchEditor`**

Render it only when the center tab is `files`, passing the active worktree path or `null`.

- [ ] **Step 3: Reset behavior on worktree changes**

Ensure the component receives updated props and does not leak stale file state across worktrees.

- [ ] **Step 4: Run affected layout tests**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts`  
Expected: PASS

---

### Task 5: Verification

- [ ] **Step 1: Run full targeted verification**

Run:
```bash
npm run typecheck
npm test -- electron/services/__tests__/fileService.test.ts src/components/__tests__/FileSearchEditor.test.ts src/layouts/__tests__/WorkspaceLayout.test.ts
```

Expected: PASS

- [ ] **Step 2: Run the full test suite if targeted checks pass**

Run:
```bash
npm test
```

Expected: PASS

---

## Notes for implementers

- Keep this v1 intentionally plain; do not add syntax highlighting or tree navigation.
- Avoid toasts for normal panel-local errors; render them inside the component.
- Prefer renderer-only dirty state instead of introducing a new store.
- Follow `verification-before-completion` before claiming the feature is done.
