# Diffs Integration Design
**Date:** 2026-04-22
**Feature:** Replace DiffReviewPanel with @pierre/diffs — Diff View, Inline Comments, Conflict Resolution

---

## Overview

Replace `DiffReviewPanel.vue` with a new implementation powered by `@pierre/diffs` (vanilla JS API). The panel gains three capabilities: a proper diff viewer, inline comments that feed into the existing thread flow, and a conflict resolution mode driven by authoritative git status detection.

---

## Architecture

```
IPC Layer
  diff:getConflictedFiles(worktreeId)  →  string[] of conflicted relative paths
  diff:writeFileContent(worktreeId, relativePath, content)  →  void
  diff:fileMergeSides(worktreeId, path)  →  { before: string, after: string }  [existing]

scmStore (extended)
  conflictedFiles: Map<worktreeId, Set<string>>
  resolveConflict(worktreeId, path, content): Promise<void>

DiffReviewPanel.vue (replaced)
  conflictedFiles.has(selectedFile) ?
    YES → UnresolvedFile (diffs.com)
    NO  → FileDiff (diffs.com) + DiffLineAnnotation comments

useDiffPanel.ts (new composable)
  Manages diffs.com component lifecycle (mount, destroy, swap on file change)
```

---

## IPC Changes

### `diff:getConflictedFiles(worktreeId: string): string[]`
- Runs `git status --porcelain` in the worktree root
- Filters lines with status codes: `UU`, `AA`, `DD`, `AU`, `UA`
- Returns relative file paths of conflicted files
- Called on every existing SCM refresh cycle — no additional polling

### `diff:writeFileContent(worktreeId: string, relativePath: string, content: string): void`
- Writes resolved content to disk via `fs.writeFile` in main process
- Called after the user resolves a merge conflict

Both handlers are added to `apps/desktop/electron/ipcChannels.ts` following the existing `diff:` channel pattern.

---

## scmStore Extensions

```ts
// New state
conflictedFiles: Map<string, Set<string>>  // worktreeId → Set of conflicted paths

// New action
async resolveConflict(worktreeId: string, path: string, content: string): Promise<void>
  // 1. Calls scm:writeFileContent IPC
  // 2. Triggers SCM refresh → conflictedFiles updates automatically
```

Population: `conflictedFiles` is populated during the existing SCM refresh cycle by calling `diff:getConflictedFiles`. No new polling interval needed.

---

## Component: `DiffReviewPanel.vue` (Replaced)

### Rendering Modes

**Normal mode (`FileDiff`)** — when selected file is not in `conflictedFiles`:
- Fetch old/new file content via existing `diff:fileMergeSides` IPC, then instantiate `new FileDiff(containerRef)`
- Attach `DiffLineAnnotation` to each line to render a comment gutter button
- Clicking a gutter button injects a plain HTML comment form as the annotation body
- On submit: constructs a `DiffReviewItem` from the line range + note text, dispatches into existing thread flow
- On file change: destroy instance, mount new one

**Conflict resolution mode (`UnresolvedFile`)** — when selected file is in `conflictedFiles`:
- Instantiate `new UnresolvedFile(containerRef, { file: rawFileContent })`
- `onMergeConflictResolve` callback → `scmStore.resolveConflict(worktreeId, path, resolvedContent)`
- After write, SCM refresh removes file from `conflictedFiles` → panel auto-switches to `FileDiff`

### Composable: `useDiffPanel.ts`

Encapsulates `@pierre/diffs` lifecycle so `DiffReviewPanel.vue` stays declarative:
- `mountFileDiff(el, options)` — mounts `FileDiff`, returns destroy fn
- `mountUnresolvedFile(el, options)` — mounts `UnresolvedFile`, returns destroy fn
- Watches `selectedFile` + `isConflicted` — tears down old instance, mounts appropriate new one
- Exposes `onCommentSubmit` event for `DiffReviewPanel` to wire to thread dispatch

### Comment Form

A minimal plain HTML element injected as a `DiffLineAnnotation` body:
- `<textarea>` for the note
- `<select>` for `ReviewIntent` (fix / clarify / rework)
- Submit button
- No framework dependency — lives inside diffs.com's Shadow DOM boundary
- On submit: dispatches a custom DOM event that `useDiffPanel.ts` listens to

---

## Data Flow: Inline Comments → Thread

```
User clicks gutter button on a diff line
  → Comment form appears (DiffLineAnnotation body)
  → User types note, selects intent, submits
  → useDiffPanel emits onCommentSubmit({ filePath, lineRange, note, intent })
  → DiffReviewPanel constructs DiffReviewItem (existing type, no changes)
  → Dispatches via existing DiffReviewItem → thread pipeline
```

No changes to `DiffReviewItem`, `DraftDiffReviewSelection`, or thread dispatch logic.

---

## Data Flow: Conflict Resolution

```
SCM refresh detects UU/AA/DD files via git status
  → scmStore.conflictedFiles updated
  → DiffReviewPanel switches to UnresolvedFile mode for conflicted file
  → User selects current / incoming / both for each conflict section
  → onMergeConflictResolve fires with resolved content string
  → scmStore.resolveConflict(worktreeId, path, content)
    → IPC: diff:writeFileContent writes to disk
    → SCM refresh triggered
    → conflictedFiles no longer contains file
    → Panel switches back to FileDiff mode automatically
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/desktop/src/components/DiffReviewPanel.vue` | Replace entirely |
| `apps/desktop/src/composables/useDiffPanel.ts` | Create new |
| `apps/desktop/src/stores/scmStore.ts` | Add `conflictedFiles` state + `resolveConflict` action |
| `apps/desktop/electron/ipcChannels.ts` | Add `diff:getConflictedFiles` + `diff:writeFileContent` handlers |
| `apps/desktop/src/env.d.ts` | Add IPC type signatures for new channels |
| `package.json` (desktop) | Add `@pierre/diffs` dependency |

---

## Out of Scope

- Multi-file conflict resolution flow (one file at a time)
- Comment threading / replies (comments go to AI thread, not each other)
- Syntax highlighting worker pool (can be added later as perf optimization)
- SSR or React API usage — vanilla JS API only
