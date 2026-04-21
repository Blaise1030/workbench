# Tech Debt Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three sequential PRs that eliminate performance hotspots, decompose `WorkspaceLayout.vue` into focused composables, and make `SourceControlPanel` self-contained via a Pinia store.

**Architecture:** PR1 patches hot paths in-place with no structural change. PR2 extracts three composables from `WorkspaceLayout.vue` without introducing new stores. PR3 promotes the SCM composable to a Pinia store so `SourceControlPanel` owns its own data.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Pinia, Vite, Vitest, `vue-tsc`, Electron IPC via `contextBridge`.

**Working directory for all commands:** `apps/desktop`

---

## PR 1 — Quick Wins

### Task 1: Add O(1) index to `runStore`

**Files:**
- Modify: `apps/desktop/src/stores/runStore.ts`

- [ ] **Step 1: Open the file and read the current state**

  Current `runStore.ts` (full file — it is short):

  ```ts
  import { defineStore } from "pinia";
  import type { RunStatus } from "@shared/domain";

  export interface RunConsole {
    runId: string;
    threadId: string;
    status: RunStatus;
    output: string[];
  }

  export const useRunStore = defineStore("run", {
    state: () => ({
      runs: [] as RunConsole[]
    }),
    getters: {
      statusByThreadId(state): Record<string, RunStatus> {
        const map: Record<string, RunStatus> = {};
        for (const run of state.runs) {
          if (!map[run.threadId]) map[run.threadId] = run.status;
        }
        return map;
      }
    },
    actions: {
      start(runId: string, threadId: string): void {
        this.runs.unshift({ runId, threadId, status: "running", output: [] });
      },
      append(runId: string, line: string): void {
        const run = this.runs.find((r) => r.runId === runId);
        if (run) run.output.push(line);
      },
      setStatus(runId: string, status: RunStatus): void {
        const run = this.runs.find((r) => r.runId === runId);
        if (run) run.status = status;
      }
    }
  });
  ```

- [ ] **Step 2: Replace the file with the indexed version**

  ```ts
  import { defineStore } from "pinia";
  import type { RunStatus } from "@shared/domain";

  export interface RunConsole {
    runId: string;
    threadId: string;
    status: RunStatus;
    output: string[];
  }

  export const useRunStore = defineStore("run", {
    state: () => ({
      runs: [] as RunConsole[],
      _index: new Map<string, RunConsole>()
    }),
    getters: {
      /** Latest run status keyed by threadId. Runs are stored newest-first. */
      statusByThreadId(state): Record<string, RunStatus> {
        const map: Record<string, RunStatus> = {};
        for (const run of state.runs) {
          if (!map[run.threadId]) map[run.threadId] = run.status;
        }
        return map;
      }
    },
    actions: {
      start(runId: string, threadId: string): void {
        const entry: RunConsole = { runId, threadId, status: "running", output: [] };
        this.runs.unshift(entry);
        this._index.set(runId, entry);
      },
      append(runId: string, line: string): void {
        this._index.get(runId)?.output.push(line);
      },
      setStatus(runId: string, status: RunStatus): void {
        const run = this._index.get(runId);
        if (run) run.status = status;
      }
    }
  });
  ```

- [ ] **Step 3: Run tests to verify nothing broke**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/stores/runStore.ts
  git commit -m "perf(runStore): add Map index for O(1) append and setStatus lookups"
  ```

---

### Task 2: De-reactify timer handles

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue` (line ~1694)
- Modify: `apps/desktop/src/components/ThreadSidebar.vue` (line ~291)

#### 2a — `WorkspaceLayout.vue`

- [ ] **Step 1: Find the worktreeHealthInterval ref declaration**

  Search for this pattern in `WorkspaceLayout.vue`:

  ```
  let worktreeHealthInterval: ReturnType<typeof setInterval> | null = null;
  ```

  It is around line 1694. Confirm the variable is declared as `let` (not `ref`) — if it is already `let`, this file may already be patched; skip to 2b.

  If it is declared as `const worktreeHealthInterval = ref<ReturnType<typeof setInterval> | null>(null)`, change every `.value` access:

  - Declaration: `const worktreeHealthInterval = ref<...>(null)` → `let worktreeHealthInterval: ReturnType<typeof setInterval> | null = null`
  - Set: `worktreeHealthInterval.value = setInterval(...)` → `worktreeHealthInterval = setInterval(...)`
  - Clear: `if (worktreeHealthInterval.value) clearInterval(worktreeHealthInterval.value)` → `if (worktreeHealthInterval) clearInterval(worktreeHealthInterval)`

#### 2b — `ThreadSidebar.vue`

- [ ] **Step 2: Find the collapsedPopoverHoverCloseTimer ref (line ~291)**

  Current code:
  ```ts
  const collapsedPopoverHoverCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  ```

  Replace the declaration and all `.value` usages:

  - Declaration: `const collapsedPopoverHoverCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null)` → `let collapsedPopoverHoverCloseTimer: ReturnType<typeof setTimeout> | null = null`
  - Line ~294: `const t = collapsedPopoverHoverCloseTimer.value` → `const t = collapsedPopoverHoverCloseTimer`
  - Line ~297: `collapsedPopoverHoverCloseTimer.value = null` → `collapsedPopoverHoverCloseTimer = null`
  - Line ~303: `collapsedPopoverHoverCloseTimer.value = setTimeout(...)` → `collapsedPopoverHoverCloseTimer = setTimeout(...)`
  - Line ~305: `collapsedPopoverHoverCloseTimer.value = null` → `collapsedPopoverHoverCloseTimer = null`

  Remove the `ref` import from `vue` if it is no longer used in `ThreadSidebar.vue` (check other usages first).

- [ ] **Step 3: Run tests**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/layouts/WorkspaceLayout.vue \
          apps/desktop/src/components/ThreadSidebar.vue
  git commit -m "perf: convert timer handles from ref to plain let variables"
  ```

---

### Task 3: Remove duplicate LRU eviction loop

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue` (around line 712)

- [ ] **Step 1: Find and remove the manual eviction loop**

  Locate the block after `diffCache.set(key, result)` that looks like:

  ```ts
  diffCache.set(key, result);
  while (diffCache.size > 24) {
    const oldest = diffCache.keys().next().value;
    if (!oldest) break;
    diffCache.delete(oldest);
  }
  ```

  Delete the `while` block. `LruMap` is constructed with `new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX)` and already enforces the cap internally. The while loop is dead code.

  After deletion, the relevant lines should look like:

  ```ts
  diffCache.set(key, result);
  // (nothing else — LruMap caps automatically)
  ```

- [ ] **Step 2: Run tests**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/desktop/src/layouts/WorkspaceLayout.vue
  git commit -m "perf: remove redundant manual LRU eviction loop (LruMap handles it)"
  ```

---

## PR 2 — WorkspaceLayout Decomposition

> **Note:** `WorkspaceLayout.vue` is 2,278 lines. Before starting each task, read the relevant section of the file in full so you have accurate line numbers. The line numbers in this plan are approximate references — use `grep -n` to find the current exact locations.

### Task 4: Extract `useWorktreeHealth`

**Files:**
- Create: `apps/desktop/src/composables/useWorktreeHealth.ts`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Find the worktree health code in WorkspaceLayout.vue**

  ```bash
  grep -n 'checkWorktreeHealth\|worktreeHealthInterval' apps/desktop/src/layouts/WorkspaceLayout.vue
  ```

  You will find:
  - `async function checkWorktreeHealth(): Promise<void>` — the health check function
  - `let worktreeHealthInterval` — timer declaration
  - `setInterval(() => void checkWorktreeHealth(), 60_000)` — where the interval is started (inside `onMounted` or similar)
  - `clearInterval(worktreeHealthInterval)` — in `onBeforeUnmount`

  Read those lines in full before continuing.

- [ ] **Step 2: Create `useWorktreeHealth.ts`**

  `getApi` is a function defined inside `WorkspaceLayout.vue` (it returns `window.workspaceApi` or equivalent — check the exact definition with `grep -n 'function getApi\|const getApi' apps/desktop/src/layouts/WorkspaceLayout.vue`). The composable receives it as a parameter.

  ```ts
  // apps/desktop/src/composables/useWorktreeHealth.ts
  import { onBeforeUnmount } from "vue";
  import type { useWorkspaceStore } from "@/stores/workspaceStore";

  export function useWorktreeHealth(
    workspace: ReturnType<typeof useWorkspaceStore>,
    getApi: () => unknown  // replace `unknown` with the actual return type of getApi from WorkspaceLayout
  ): void {
    let worktreeHealthInterval: ReturnType<typeof setInterval> | null = null;

    async function checkWorktreeHealth(): Promise<void> {
      // PASTE the body of checkWorktreeHealth() from WorkspaceLayout.vue here verbatim.
      // `workspace` and `getApi` come from the arguments above — no other changes needed.
    }

    worktreeHealthInterval = setInterval(() => void checkWorktreeHealth(), 60_000);
    void checkWorktreeHealth();

    onBeforeUnmount(() => {
      if (worktreeHealthInterval) clearInterval(worktreeHealthInterval);
    });
  }
  ```

  > **Important:** The body of `checkWorktreeHealth()` must be copied verbatim from `WorkspaceLayout.vue`. Only change how `workspace` and `getApi` are accessed (from arguments, not from `useWorkspaceStore()` / local closure).

- [ ] **Step 3: Wire it in WorkspaceLayout.vue**

  In `WorkspaceLayout.vue`:

  1. Add import at the top of `<script setup>`:
     ```ts
     import { useWorktreeHealth } from "@/composables/useWorktreeHealth";
     ```

  2. Delete the `checkWorktreeHealth` function definition.
  3. Delete the `let worktreeHealthInterval` declaration.
  4. Delete the `setInterval` call and the `clearInterval` call in `onBeforeUnmount`.
  5. Add one line where `onMounted` previously started the interval:
     ```ts
     useWorktreeHealth(workspace);
     ```

- [ ] **Step 4: Typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

  Fix any type errors before proceeding.

- [ ] **Step 5: Run tests**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/desktop/src/composables/useWorktreeHealth.ts \
          apps/desktop/src/layouts/WorkspaceLayout.vue
  git commit -m "refactor: extract useWorktreeHealth composable from WorkspaceLayout"
  ```

---

### Task 5: Extract `useThreadNavigation`

**Files:**
- Create: `apps/desktop/src/composables/useThreadNavigation.ts`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Find thread navigation code**

  ```bash
  grep -n 'maybeSetResumeBootstrap\|prevThread\|nextThread\|onPrevThread\|onNextThread' apps/desktop/src/layouts/WorkspaceLayout.vue
  ```

  You will find:
  - `function maybeSetResumeBootstrap(threadId: string | null): void` (~line 518)
  - The `watch` on `workspace.activeThreadId` that calls `maybeSetResumeBootstrap`
  - The `onPrevThread` and `onNextThread` callbacks passed to `useWorkspaceKeybindings`

  Read all those lines in full before continuing.

- [ ] **Step 2: Create `useThreadNavigation.ts`**

  ```ts
  // apps/desktop/src/composables/useThreadNavigation.ts
  import { watch } from "vue";
  import type { useWorkspaceStore } from "@/stores/workspaceStore";

  export function useThreadNavigation(
    workspace: ReturnType<typeof useWorkspaceStore>,
    getApi: () => unknown  // replace `unknown` with the actual return type of getApi from WorkspaceLayout
  ): {
    prevThread: () => void;
    nextThread: () => void;
  } {
    function maybeSetResumeBootstrap(threadId: string | null): void {
      // PASTE body verbatim from WorkspaceLayout.vue
    }

    watch(
      () => workspace.activeThreadId,
      (id) => {
        maybeSetResumeBootstrap(id);
      }
    );

    function prevThread(): void {
      // PASTE onPrevThread body from WorkspaceLayout's keybindings context verbatim
    }

    function nextThread(): void {
      // PASTE onNextThread body from WorkspaceLayout's keybindings context verbatim
    }

    return { prevThread, nextThread };
  }
  ```

  > **Important:** Copy function bodies verbatim from `WorkspaceLayout.vue`. The composable receives `workspace` and `api` as arguments so it doesn't need to call `useWorkspaceStore()` internally.

- [ ] **Step 3: Wire it in WorkspaceLayout.vue**

  1. Add import:
     ```ts
     import { useThreadNavigation } from "@/composables/useThreadNavigation";
     ```

  2. Replace the inline `maybeSetResumeBootstrap` definition and its associated watch with:
     ```ts
     const { prevThread, nextThread } = useThreadNavigation(workspace, getApi());
     ```

  3. Pass `prevThread` and `nextThread` to `useWorkspaceKeybindings` wherever `onPrevThread` and `onNextThread` callbacks were previously inlined.

- [ ] **Step 4: Typecheck and test**

  ```bash
  cd apps/desktop && pnpm typecheck && pnpm test
  ```

  Expected: no errors, all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/composables/useThreadNavigation.ts \
          apps/desktop/src/layouts/WorkspaceLayout.vue
  git commit -m "refactor: extract useThreadNavigation composable from WorkspaceLayout"
  ```

---

### Task 6: Extract `useScmState`

This is the largest extraction. Read `WorkspaceLayout.vue` in full before starting.

**Files:**
- Create: `apps/desktop/src/composables/useScmState.ts`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Identify all SCM code to move**

  ```bash
  grep -n 'repoStatus\|scmMeta\|hasGitRepository\|selectedScmPath\|selectedScmScope\|selectedDiff\|selectedDiffLoading\|diffRefreshSeq\|selectedDiffSeq\|diffCache\|refreshRepoStatus\|loadSelectedMerge\|applyRepoStatusSelection\|loadSelectedDiff\|DIFF_MERGE_CACHE_MAX' apps/desktop/src/layouts/WorkspaceLayout.vue
  ```

  The code to move includes:
  - Constants: `DIFF_MERGE_CACHE_MAX` (value `24`)
  - Refs: `hasGitRepository`, `repoStatus`, `scmMeta`, `selectedScmPath`, `selectedScmScope`, `selectedDiffLoading`, `diffCache`
  - Let variables: `diffRefreshSeq`, `selectedDiffSeq`
  - Functions: `applyRepoStatusSelection`, `loadSelectedMerge`, `refreshRepoStatus`, and any helper like `cacheKey`
  - Watches: all `watch()` calls whose body calls `refreshRepoStatus()` or `loadSelectedMerge()`

- [ ] **Step 2: Create `useScmState.ts`**

  ```ts
  // apps/desktop/src/composables/useScmState.ts
  import { ref, watch } from "vue";
  import { LruMap } from "@/lib/lruMap";
  import type { RepoStatusEntry, FileDiffScope, FileMergeSidesResult } from "@shared/domain";
  import type { useWorkspaceStore } from "@/stores/workspaceStore";

  const DIFF_MERGE_CACHE_MAX = 24;

  export type ScmMeta = {
    shortLabel: string;
    branch: string;
    lastCommitSubject: string | null;
  };

  export function useScmState(
    workspace: ReturnType<typeof useWorkspaceStore>,
    getApi: () => unknown  // replace `unknown` with the actual return type of getApi from WorkspaceLayout
  ) {
    const hasGitRepository = ref<boolean | null>(null);
    const repoStatus = ref<RepoStatusEntry[]>([]);
    const scmMeta = ref<ScmMeta>({ shortLabel: "", branch: "", lastCommitSubject: null });
    const selectedScmPath = ref<string | null>(null);
    const selectedScmScope = ref<FileDiffScope | null>(null);
    const selectedDiffLoading = ref(false);
    const diffCache = new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX);

    let diffRefreshSeq = 0;
    let selectedDiffSeq = 0;

    // PASTE cacheKey(), applyRepoStatusSelection(), loadSelectedMerge(),
    // refreshRepoStatus() verbatim from WorkspaceLayout.vue here.
    // Replace `workspace.` with the `workspace` argument.
    // Replace inline `getApi()` calls to use the `getApi` argument.

    // PASTE all watch() calls that trigger refreshRepoStatus or loadSelectedMerge here.

    return {
      hasGitRepository,
      repoStatus,
      scmMeta,
      selectedScmPath,
      selectedScmScope,
      selectedDiffLoading,
      diffCache,
      refreshRepoStatus,
      loadSelectedMerge,
      applyRepoStatusSelection
    };
  }
  ```

- [ ] **Step 3: Wire it in WorkspaceLayout.vue**

  1. Add import:
     ```ts
     import { useScmState } from "@/composables/useScmState";
     ```

  2. Replace all the SCM ref declarations and functions with a single call:
     ```ts
     const {
       hasGitRepository,
       repoStatus,
       scmMeta,
       selectedScmPath,
       selectedScmScope,
       selectedDiffLoading,
       diffCache,
       refreshRepoStatus,
       loadSelectedMerge,
       applyRepoStatusSelection
     } = useScmState(workspace, getApi);
     ```

  3. Remove the now-redundant `import { LruMap } from "@/lib/lruMap"` if `diffCache` is no longer constructed in `WorkspaceLayout.vue`.

  4. Verify the `WorkspaceLayout.vue` template still compiles — all the ref names are unchanged so template bindings should need no edits.

- [ ] **Step 4: Typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

  Fix all errors before continuing. Common issues:
  - `getApi` type: match whatever type `WorkspaceLayout.vue` currently uses for the API object
  - `FileMergeSidesResult`, `FileDiffScope`, `RepoStatusEntry` — check their import source in the original file and mirror it

- [ ] **Step 5: Run tests**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/desktop/src/composables/useScmState.ts \
          apps/desktop/src/layouts/WorkspaceLayout.vue
  git commit -m "refactor: extract useScmState composable from WorkspaceLayout"
  ```

---

### Task 7: Verify WorkspaceLayout line count and PR2 smoke test

**Files:** None (verification only)

- [ ] **Step 1: Check line count**

  ```bash
  wc -l apps/desktop/src/layouts/WorkspaceLayout.vue
  ```

  Target: under 800 lines. If still above 1000, identify remaining large blocks and consider additional extraction.

- [ ] **Step 2: Run full test suite**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 3: Manual smoke test** (requires running the Electron app)

  Verify:
  - SCM panel shows file diffs correctly when a git repo is open
  - Clicking prev/next thread in sidebar navigates correctly
  - Worktree health indicator updates (wait or simulate a health change)

- [ ] **Step 4: Commit smoke test sign-off note**

  ```bash
  git commit --allow-empty -m "chore: PR2 WorkspaceLayout decomposition complete — smoke tested"
  ```

---

## PR 3 — SCM Pinia Store + SourceControlPanel Self-Contained

### Task 8: Create `scmStore.ts`

**Files:**
- Create: `apps/desktop/src/stores/scmStore.ts`

- [ ] **Step 1: Create the store**

  Copy the contents of `useScmState.ts` (created in Task 6) as the basis. The store uses Pinia's `defineStore` with the `setup()` syntax so it can use `watch` internally.

  ```ts
  // apps/desktop/src/stores/scmStore.ts
  import { ref, watch } from "vue";
  import { defineStore } from "pinia";
  import { LruMap } from "@/lib/lruMap";
  import { useWorkspaceStore } from "@/stores/workspaceStore";
  import type { RepoStatusEntry, FileDiffScope, FileMergeSidesResult } from "@shared/domain";
  // getApi is defined in WorkspaceLayout as a local function (grep "function getApi" there).
  // In the store, call window.workspaceApi directly or extract getApi to a shared helper.
  // Check: grep -n 'function getApi\|const getApi' apps/desktop/src/layouts/WorkspaceLayout.vue

  const DIFF_MERGE_CACHE_MAX = 24;

  export type ScmMeta = {
    shortLabel: string;
    branch: string;
    lastCommitSubject: string | null;
  };

  export const useScmStore = defineStore("scm", () => {
    const workspace = useWorkspaceStore();

    const hasGitRepository = ref<boolean | null>(null);
    const repoStatus = ref<RepoStatusEntry[]>([]);
    const scmMeta = ref<ScmMeta>({ shortLabel: "", branch: "", lastCommitSubject: null });
    const selectedScmPath = ref<string | null>(null);
    const selectedScmScope = ref<FileDiffScope | null>(null);
    const selectedDiffLoading = ref(false);
    const diffCache = new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX);

    let diffRefreshSeq = 0;
    let selectedDiffSeq = 0;

    function clearOnWorktreeChange(): void {
      hasGitRepository.value = null;
      repoStatus.value = [];
      scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
      selectedScmPath.value = null;
      selectedScmScope.value = null;
      selectedDiffLoading.value = false;
      diffCache.clear();
    }

    // PASTE applyRepoStatusSelection(), loadSelectedMerge(), refreshRepoStatus()
    // verbatim from useScmState.ts — replacing getApi() with the direct import.

    watch(
      () => workspace.activeWorktree?.id,
      (next, prev) => {
        if (next !== prev) {
          clearOnWorktreeChange();
          if (next) void refreshRepoStatus();
        }
      }
    );

    // PASTE remaining watches from useScmState.ts here.

    return {
      hasGitRepository,
      repoStatus,
      scmMeta,
      selectedScmPath,
      selectedScmScope,
      selectedDiffLoading,
      diffCache,
      clearOnWorktreeChange,
      refreshRepoStatus,
      loadSelectedMerge,
      applyRepoStatusSelection
    };
  });
  ```

- [ ] **Step 2: Typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

  Fix any errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/desktop/src/stores/scmStore.ts
  git commit -m "feat(scmStore): create Pinia SCM store from useScmState composable"
  ```

---

### Task 9: Migrate `SourceControlPanel.vue` to use `useScmStore`

**Files:**
- Modify: `apps/desktop/src/components/SourceControlPanel.vue`

- [ ] **Step 1: Read the current props interface**

  ```bash
  grep -n 'defineProps\|defineEmits' apps/desktop/src/components/SourceControlPanel.vue
  ```

  Note which props are SCM-related (they will be removed) and which are not (keep them). SCM-related props to remove:
  - `repoStatus`
  - `selectedPath` / `selectedScope` (the currently selected SCM entry)
  - `selectedDiff` / `selectedDiffLoading`
  - `scmMeta` / `lastCommitSubject`
  - `hasGitRepository`
  - `scmCwd` (the worktree path — now available from workspace store)

  Non-SCM props to keep (these come from the parent for layout or non-SCM reasons):
  - `activeThreadId`
  - Any commit-related props (`scmCommitAvailable`, `scmCommitBusy`, `suggestCommitAvailable`, etc.) — check whether these can also move to the store; if yes, move them; if they require parent-level context, keep as props.

- [ ] **Step 2: Add store import and replace prop reads**

  At the top of `<script setup>` in `SourceControlPanel.vue`:

  ```ts
  import { useScmStore } from "@/stores/scmStore";
  import { useWorkspaceStore } from "@/stores/workspaceStore";

  const scm = useScmStore();
  const workspace = useWorkspaceStore();
  ```

  Then replace every `props.repoStatus` with `scm.repoStatus`, `props.selectedPath` with `scm.selectedScmPath`, `props.selectedScope` with `scm.selectedScmScope`, etc.

  Replace `props.scmCwd` with `workspace.activeWorktree?.path`.

- [ ] **Step 3: Replace emit-triggered refreshes with store actions**

  Find all `emit('branch-changed')` or similar refresh triggers inside `SourceControlPanel.vue`. Replace with direct store calls:

  ```ts
  // Before:
  emit('branch-changed')
  // After:
  void scm.refreshRepoStatus()
  ```

  Remove the corresponding entries from `defineEmits` once all callers are gone.

- [ ] **Step 4: Remove SCM props from `defineProps`**

  Delete all SCM-related entries from the `defineProps<{...}>` block.

- [ ] **Step 5: Typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

  Fix errors. Most will be in `WorkspaceLayout.vue` (which still passes the now-removed props).

- [ ] **Step 6: Commit**

  ```bash
  git add apps/desktop/src/components/SourceControlPanel.vue
  git commit -m "refactor(SourceControlPanel): replace SCM props with useScmStore"
  ```

---

### Task 10: Clean up SCM bindings in `WorkspaceLayout.vue`

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Remove SCM prop bindings from the template**

  In the `<template>` section of `WorkspaceLayout.vue`, find the `<SourceControlPanel ...>` usage and remove all bindings that correspond to props deleted in Task 9:

  ```html
  <!-- Remove these (example — match actual names in the file): -->
  :repo-status="repoStatus"
  :selected-path="selectedScmPath"
  :selected-scope="selectedScmScope"
  :scm-cwd="workspace.activeWorktree?.path"
  @branch-changed="void refreshRepoStatus()"
  ```

- [ ] **Step 2: Remove useScmState import and call**

  If `WorkspaceLayout.vue` is still calling `useScmState(...)`, remove that call. Instead, call `useScmStore()` only for the refs the layout template still needs directly (e.g., diff tab badge counts). If the layout no longer needs any SCM state directly, remove the import entirely.

- [ ] **Step 3: Remove the useScmState composable file**

  Now that the store takes over, the composable is no longer needed:

  ```bash
  rm apps/desktop/src/composables/useScmState.ts
  ```

  Run typecheck to confirm nothing imports it:

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

- [ ] **Step 4: Run full test suite**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/layouts/WorkspaceLayout.vue
  git rm apps/desktop/src/composables/useScmState.ts
  git commit -m "refactor(WorkspaceLayout): remove SCM prop drilling, delegate to scmStore"
  ```

---

### Task 11: Add IPC payload types to `@shared/domain`

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/electron/preload.ts`

- [ ] **Step 1: Read the existing domain types**

  ```bash
  grep -n 'export.*interface\|export.*type' apps/desktop/src/shared/domain.ts | head -40
  ```

  Note existing types to avoid duplication.

- [ ] **Step 2: Add payload interfaces to `domain.ts`**

  Append to `apps/desktop/src/shared/domain.ts`:

  ```ts
  // IPC payload types — replaces `unknown` in the preload bridge
  export interface AddWorktreePayload {
    projectId: string;
    path: string;
    branch?: string;
  }

  export interface CreateThreadPayload {
    worktreeId: string;
    agent?: string;
    title?: string;
  }

  export interface DeleteThreadPayload {
    threadId: string;
  }

  export interface RenameThreadPayload {
    threadId: string;
    title: string;
  }

  export interface ReorderThreadsPayload {
    worktreeId: string;
    threadIds: string[];
  }
  ```

  > **Important:** Check the actual handler signatures in `apps/desktop/electron/mainApp.ts` to verify the field names match. Run `grep -n 'addWorktree\|createThread\|deleteThread\|renameThread\|reorderThreads' apps/desktop/electron/mainApp.ts` and compare.

- [ ] **Step 3: Update `preload.ts` to use the new types**

  In `apps/desktop/electron/preload.ts`, replace `unknown` with the typed payloads:

  ```ts
  import type {
    AddWorktreePayload,
    CreateThreadPayload,
    DeleteThreadPayload,
    RenameThreadPayload,
    ReorderThreadsPayload
  } from "../src/shared/domain";
  ```

  Then update signatures:
  ```ts
  addWorktree: (payload: AddWorktreePayload) => ipcRenderer.invoke(IPC_CHANNELS.workspaceAddWorktree, payload),
  createThread: (payload: CreateThreadPayload) => ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateThread, payload),
  deleteThread: (payload: DeleteThreadPayload) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDeleteThread, payload),
  renameThread: (payload: RenameThreadPayload) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRenameThread, payload),
  reorderThreads: (payload: ReorderThreadsPayload) => ipcRenderer.invoke(IPC_CHANNELS.workspaceReorderThreads, payload),
  ```

- [ ] **Step 4: Typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

  Fix any call sites that passed incorrectly-shaped objects — these are real bugs surfaced by the new types.

- [ ] **Step 5: Run tests**

  ```bash
  cd apps/desktop && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/desktop/src/shared/domain.ts \
          apps/desktop/electron/preload.ts
  git commit -m "feat(ipc): add typed payload interfaces, replace unknown in preload bridge"
  ```

---

### Task 12: Final PR3 verification

**Files:** None (verification only)

- [ ] **Step 1: Full test suite**

  ```bash
  cd apps/desktop && pnpm test
  ```

- [ ] **Step 2: Full typecheck**

  ```bash
  cd apps/desktop && pnpm typecheck
  ```

- [ ] **Step 3: Manual end-to-end smoke test**

  Verify in the running Electron app:
  - Open a worktree with git changes — SCM panel loads file list
  - Click a file in the SCM panel — diff appears
  - Stage a file — it moves to staged section
  - Unstage a file — it moves back
  - Switch to a different worktree — SCM panel resets and loads new worktree's status
  - `SourceControlPanel` receives zero SCM-related props from parent (inspect with Vue DevTools)

- [ ] **Step 4: Commit sign-off**

  ```bash
  git commit --allow-empty -m "chore: PR3 SCM store migration complete — smoke tested"
  ```
