# Tech Debt Migration Design

_Date: 2026-04-21_
_Scope: apps/desktop_

---

## Overview

A three-PR sequential migration to reduce god-component complexity, eliminate performance hotspots, and make `SourceControlPanel` self-contained. Risk tolerance is high — larger rewrites are acceptable if the result is significantly cleaner. Manual re-verification after each PR.

---

## PR 1 — Quick Wins

**Goal:** Zero-risk surgical fixes to hot paths and reactive overhead. Ships immediately, independent of the sprint.

### 1.1 `runStore.ts` — O(1) index for run lookups

Add a `_index: Map<string, RunConsole>` alongside the existing `runs` array.

- `start()` populates both `runs` (for ordered iteration) and `_index` (for keyed lookup)
- `append()` and `setStatus()` use `_index.get(runId)` instead of `runs.find()`
- `_index` is cleared alongside `runs` if a reset action is ever added
- The `statusByThreadId` getter continues to iterate `runs` (newest-first order is preserved)

### 1.2 Timer handles — remove reactive wrapping

Change `worktreeHealthInterval` (`WorkspaceLayout.vue`) and `collapsedPopoverHoverCloseTimer` (`ThreadSidebar.vue`) from `ref<ReturnType<typeof setInterval> | null>` to plain `let` variables. Neither is referenced in a template or computed, so no reactivity is lost.

### 1.3 Remove duplicate LRU eviction loop

`WorkspaceLayout.vue` manually evicts entries after `diffCache.set()` with a `while` loop despite importing `LruMap` which caps size automatically. Remove the `while` loop entirely.

**Success criteria:** All existing tests pass unchanged. No visible behaviour change.

---

## PR 2 — WorkspaceLayout Decomposition

**Goal:** Reduce `WorkspaceLayout.vue` from 2,278 lines to ~600 by extracting logical clusters into composables. No new Pinia stores in this PR.

### 2.1 `src/composables/useWorktreeHealth.ts`

Owns:
- The `worktreeHealthInterval` timer
- The `checkWorktreeHealth()` async function
- `onBeforeUnmount` cleanup

Interface: `useWorktreeHealth(workspace)` — side effects only, returns nothing. WorkspaceLayout calls it once at setup.

### 2.2 `src/composables/useThreadNavigation.ts`

Owns:
- `prevThread()` and `nextThread()` handlers
- `maybeSetResumeBootstrap(threadId)` logic
- The `watch` on `workspace.activeThreadId` that calls `maybeSetResumeBootstrap`

Interface: returns `{ prevThread, nextThread }` for template use.

### 2.3 `src/composables/useScmState.ts`

Owns all SCM state and logic currently in `WorkspaceLayout.vue`:

**State:** `repoStatus`, `scmMeta`, `hasGitRepository`, `selectedScmPath`, `selectedScmScope`, `selectedDiff`, `selectedDiffLoading`, `diffRefreshSeq`, `selectedDiffSeq`, `diffCache`

**Functions:** `refreshRepoStatus()`, `loadSelectedDiff()`, `applyRepoStatusSelection()`, `loadSelectedMerge()`

**Watchers:** all `watch()` calls that trigger SCM refreshes

Interface: returns all refs and functions that WorkspaceLayout and SourceControlPanel currently use.

### 2.4 What stays in `WorkspaceLayout.vue`

- Layout panel sizing and resize state
- Tab state (`activeTab`, `shellSlotIds`, etc.)
- `provide()` calls for context-queue injection
- Shell slot management
- Template (wires composables, passes props to children)

**File changes:**
- 3 new files: `src/composables/useWorktreeHealth.ts`, `useThreadNavigation.ts`, `useScmState.ts`
- `WorkspaceLayout.vue`: 2,278 → ~600 lines

**Success criteria:** All `WorkspaceLayout.test.ts` tests pass. Manual smoke test: SCM panel loads diff, thread navigation prev/next works, worktree health check fires on interval.

---

## PR 3 — SCM Pinia Store + SourceControlPanel Self-Contained

**Goal:** Promote `useScmState` composable to a Pinia store so `SourceControlPanel` can own its own data fetching without props from `WorkspaceLayout`.

### 3.1 `src/stores/scmStore.ts`

All state and actions from `useScmState` move into a Pinia `defineStore`:

**State:** `repoStatus`, `scmMeta`, `hasGitRepository`, `selectedScmPath`, `selectedScmScope`, `selectedDiff`, `selectedDiffLoading`, `diffCache`

**Actions:** `refreshRepoStatus()`, `loadSelectedDiff()`, `clearOnWorktreeChange()`

**Watchers:** the store setup function watches `workspace.activeWorktree` directly (via `watch` inside `setup()` store syntax) and calls `clearOnWorktreeChange()` on switch.

### 3.2 `SourceControlPanel.vue` changes

- Remove all SCM-related props (`repoStatus`, `selectedEntry`, `selectedDiff`, `selectedDiffLoading`, `scmMeta`, `hasGitRepository`, `selectedScmPath`, `selectedScmScope`, `scmDiffLayout`)
- Call `useScmStore()` directly
- Replace emit-based refresh triggers (`@branch-changed="void refreshRepoStatus()"`) with direct store action calls
- Component becomes fully self-contained

### 3.3 `WorkspaceLayout.vue` changes

- Remove all SCM prop bindings passed to `SourceControlPanel`
- Call `useScmStore()` only where the template still needs SCM state (e.g., diff tab badge, active file indicator)

### 3.4 IPC payload typing (same PR)

Add typed interfaces in `@shared/domain` (the package already imported by renderer components) for the highest-traffic IPC calls:

- `AddWorktreePayload`
- `CreateThreadPayload`
- `SetActiveThreadPayload`
- `DeleteThreadPayload`
- `ReorderThreadsPayload`

Thread them through the preload bridge replacing `unknown`. Compile errors surface mismatches immediately.

**Success criteria:** `SourceControlPanel` renders with zero SCM props from parent. Staging, unstaging, and diff viewing work end-to-end. `vue-tsc --noEmit` passes with new payload types.

---

## Stretch — PR 4 (Post-Sprint)

Not in scope for the current plan but documented for later:

- Split `FileSearchEditor.vue` (2,176 lines) into `FileTree.vue` + `useFileSearch.ts` + integrate existing `CodeMirrorEditor`
- Add virtual scrolling to the thread sidebar list and file list using `@tanstack/vue-virtual`
- Replace worktree health `setInterval` with event-driven triggers from `gitHeadWatcher`

---

## Sequencing Constraints

```
PR1 (quick wins)  →  PR2 (layout decomp)  →  PR3 (SCM store)  →  PR4 (stretch)
```

PR2 and PR3 must be strictly sequential — PR3 depends on the `useScmState` composable created in PR2. PR1 is independent and can ship any time.

---

## What Is Not In Scope

- Changing any user-visible feature behaviour
- Upgrading framework versions (Vue, Electron, Vite)
- Adding new tests (existing tests are the verification baseline for PR1 and PR2)
- Modifying the landing page app
