# Worktree Context Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop workspace consistently context-scoped so every thread belongs to exactly one checkout context, thread selection activates that context, and the sidebar groups threads by `Primary` plus linked worktrees.

**Architecture:** Normalize the renderer around one active execution context: the active worktree. Treat the default checkout as the `Primary` worktree in the UI, remove mixed-context fallback logic, and make thread/file/terminal flows resolve context before opening surfaces. Build grouped thread-sidebar rendering on top of the existing store snapshot rather than introducing a second context model.

**Tech Stack:** Vue 3, Pinia, Electron IPC, Vitest, existing workspace store and desktop components

---

## File Map

### Core state and orchestration

- Modify: `apps/desktop/src/stores/workspaceStore.ts`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`
- Modify: `apps/desktop/src/shared/ipc.ts` only if a small helper type export is needed for tests; otherwise avoid changing shared IPC

### Sidebar and thread chrome

- Modify: `apps/desktop/src/components/ThreadSidebar.vue`
- Modify: `apps/desktop/src/components/ThreadGroupHeader.vue`
- Modify: `apps/desktop/src/components/ThreadRow.vue`
- Modify: `apps/desktop/src/components/ThreadTopBar.vue`
- Modify: `apps/desktop/src/components/ThreadCreateButton.vue` only if labels still say `ungrouped`

### Context labels and surface alignment

- Modify: `apps/desktop/src/components/FileSearchEditor.vue`
- Modify: `apps/desktop/src/components/SourceControlPanel.vue`
- Modify: `apps/desktop/src/components/AgentPane.vue` only if the Agent tab badge needs content from child state; otherwise keep badge logic in layout
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

### Launcher and file-open behavior

- Modify: `apps/desktop/src/components/WorkspaceLauncherModal.vue`
- Modify: `apps/desktop/src/lib/workspaceLauncherSearch.ts`

### Tests

- Modify: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
- Modify: `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`
- Modify: `apps/desktop/src/components/__tests__/ThreadRow.test.ts`
- Modify: `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts`
- Modify: `apps/desktop/src/lib/__tests__/workspaceLauncherSearch.test.ts`
- Create: `apps/desktop/src/stores/__tests__/workspaceStore.test.ts` if store grouping logic currently lacks direct coverage

## Implementation Notes

- Do not introduce a new `outside mode` or second context type.
- `Primary` is presentation logic for `worktree.isDefault === true`.
- Keep `worktreeId` as the single ownership key for threads.
- Prefer deriving grouped sidebar data in the store, not inside the sidebar component.
- Fix correctness before polish: context switching, Files scoping, dirty editor cancellation.

### Task 1: Add Store-Level Context Grouping Helpers

**Files:**
- Modify: `apps/desktop/src/stores/workspaceStore.ts`
- Test: `apps/desktop/src/stores/__tests__/workspaceStore.test.ts`

- [ ] **Step 1: Write the failing store tests**

Add tests for:
- grouped contexts return `Primary` first when `isDefault` is true
- threads are partitioned by `worktreeId`
- active context metadata exposes display label `Primary` for default worktree

Suggested test scaffold:

```ts
it("orders grouped contexts with Primary first", () => {
  const store = useWorkspaceStore();
  store.hydrate(makeSnapshot({
    worktrees: [
      makeWorktree({ id: "wt-linked", isDefault: false, name: "implement-google" }),
      makeWorktree({ id: "wt-primary", isDefault: true, name: "feature/auth" })
    ],
    threads: [
      makeThread({ id: "t1", worktreeId: "wt-primary" }),
      makeThread({ id: "t2", worktreeId: "wt-linked" })
    ],
    activeWorktreeId: "wt-primary"
  }));

  expect(store.threadContextGroups.map((g) => g.label)).toEqual(["Primary", "implement-google"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop vitest run apps/desktop/src/stores/__tests__/workspaceStore.test.ts`
Expected: FAIL because grouped context getters do not exist yet

- [ ] **Step 3: Write minimal store implementation**

Add focused getters similar to:

```ts
threadContextGroups(state) {
  return orderedWorktrees.map((wt) => ({
    worktreeId: wt.id,
    label: wt.isDefault ? "Primary" : wt.name,
    branch: wt.branch,
    isActive: wt.id === state.activeWorktreeId,
    threads: state.threads.filter((t) => t.worktreeId === wt.id)
  }));
}
```

Also add a small getter for active context badge data so layout and thread header can share one interpretation.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop vitest run apps/desktop/src/stores/__tests__/workspaceStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/stores/workspaceStore.ts apps/desktop/src/stores/__tests__/workspaceStore.test.ts
git commit -m "feat: add grouped worktree context store helpers"
```

### Task 2: Make Thread Selection the Canonical Context Switch

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`
- Test: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing layout tests**

Cover:
- selecting a thread in another worktree switches active worktree first
- selecting a thread in the default worktree restores `Primary`
- manual worktree switching restores `lastActiveThreadId` or first thread in that worktree

Suggested assertions:

```ts
await wrapper.find('[data-testid="thread-row-t-linked"]').trigger("click");

expect(setActive).toHaveBeenCalledWith({
  projectId: "project-1",
  worktreeId: "wt-linked",
  threadId: "t-linked"
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop vitest run apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: FAIL because current selection and panel scoping still rely on mixed active-thread fallback behavior

- [ ] **Step 3: Update layout orchestration**

Implement these rules in `WorkspaceLayout.vue`:
- remove `fileExplorerWorktree` computed fallback
- make Files receive `workspace.activeWorktree`
- make `handleSelectThread()` always resolve the thread's worktree and call `setActive()` with that worktree and thread
- keep `handleSelectWorktree()` responsible for restoring thread selection inside the chosen worktree

Minimal target shape:

```ts
async function handleSelectThread(threadId: string) {
  const thread = workspace.threads.find((t) => t.id === threadId);
  if (!thread) return;
  await api.setActive({
    projectId: thread.projectId,
    worktreeId: thread.worktreeId,
    threadId: thread.id
  });
  await refreshSnapshot();
  await refreshRepoStatus();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop vitest run apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat: align thread selection with active worktree context"
```

### Task 3: Fix Files Context Scoping and Dirty-Switch Correctness

**Files:**
- Modify: `apps/desktop/src/components/FileSearchEditor.vue`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`
- Test: `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts`
- Test: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing regression tests**

Cover:
- cancelling a dirty context switch leaves the editor aligned with the original worktree
- file open requests cannot overwrite state after a newer request wins
- Files always shows the active worktree label, never an active-thread-derived alternate root

Suggested failing test shape:

```ts
it("keeps original worktree after cancelling dirty context switch", async () => {
  // switch props from wt-primary to wt-linked
  // reject discard dialog
  // assert save still targets wt-primary
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop vitest run apps/desktop/src/components/__tests__/FileSearchEditor.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: FAIL because current watcher bails after prop change and open-file requests are unsequenced

- [ ] **Step 3: Implement the minimal correctness fixes**

In `FileSearchEditor.vue`:
- add request sequencing for `openFile()`
- replace the worktree-path watcher with state that can reject pending context change cleanly
- preserve existing worktree binding if the user cancels discard
- keep save target derived from the accepted active context only

In `WorkspaceLayout.vue`:
- do not pass any non-active context to Files

Possible implementation direction:

```ts
let openSeq = 0;

async function openFile(relativePath: string) {
  const seq = ++openSeq;
  const content = await api.readFile(cwd, relativePath);
  if (seq !== openSeq) return;
  selectedPath.value = relativePath;
  loadedContent.value = content;
  draftContent.value = content;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop vitest run apps/desktop/src/components/__tests__/FileSearchEditor.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/FileSearchEditor.vue apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/components/__tests__/FileSearchEditor.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "fix: keep files editor aligned to active worktree context"
```

### Task 4: Render Sidebar Groups by Context

**Files:**
- Modify: `apps/desktop/src/components/ThreadSidebar.vue`
- Modify: `apps/desktop/src/components/ThreadGroupHeader.vue`
- Modify: `apps/desktop/src/components/ThreadRow.vue`
- Test: `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`
- Test: `apps/desktop/src/components/__tests__/ThreadRow.test.ts`

- [ ] **Step 1: Write the failing sidebar tests**

Cover:
- sidebar renders `Primary` group first
- linked worktree groups render after `Primary`
- active group expanded by default
- clicking a row in a collapsed non-active group emits the same select event for the target thread

Suggested test scaffold:

```ts
expect(wrapper.text()).toContain("Primary");
expect(wrapper.text()).toContain("implement-google");
expect(groupOrder(wrapper)).toEqual(["Primary", "implement-google", "implement-facebook"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop vitest run apps/desktop/src/components/__tests__/ThreadSidebar.test.ts apps/desktop/src/components/__tests__/ThreadRow.test.ts`
Expected: FAIL because sidebar still assumes flat or older group semantics

- [ ] **Step 3: Implement grouped rendering**

Update `ThreadSidebar.vue` to consume the store's grouped context data and render:
- one section per worktree context
- `Primary` label for default worktree
- active group expanded, others collapsed
- existing row interactions reused inside each group

Keep collapse state local and keyed by `worktreeId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop vitest run apps/desktop/src/components/__tests__/ThreadSidebar.test.ts apps/desktop/src/components/__tests__/ThreadRow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ThreadSidebar.vue apps/desktop/src/components/ThreadGroupHeader.vue apps/desktop/src/components/ThreadRow.vue apps/desktop/src/components/__tests__/ThreadSidebar.test.ts apps/desktop/src/components/__tests__/ThreadRow.test.ts
git commit -m "feat: group thread sidebar by worktree context"
```

### Task 5: Add Active Context Badges to Main Chrome

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`
- Modify: `apps/desktop/src/components/ThreadTopBar.vue`
- Modify: `apps/desktop/src/components/SourceControlPanel.vue`
- Possibly modify: `apps/desktop/src/components/PillTabs` call sites only, not the shared component itself, unless absolutely required
- Test: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing badge tests**

Cover:
- Agent tab shows `Primary` when default worktree is active
- Agent tab shows linked worktree name when linked context is active
- thread top bar shows the same active context label

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop vitest run apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: FAIL because no context badge is rendered yet

- [ ] **Step 3: Implement badge rendering**

Use one shared computed source from store/layout, then render small consistent badges in:
- Agent tab label
- thread top bar
- Files and Diff header rows where low-risk and visually clean

Do not add a separate global source of truth; derive from active worktree only.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop vitest run apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/components/ThreadTopBar.vue apps/desktop/src/components/SourceControlPanel.vue apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat: surface active worktree context badges"
```

### Task 6: Align Launcher and File-Open Flows with Context Rules

**Files:**
- Modify: `apps/desktop/src/components/WorkspaceLauncherModal.vue`
- Modify: `apps/desktop/src/lib/workspaceLauncherSearch.ts`
- Test: `apps/desktop/src/lib/__tests__/workspaceLauncherSearch.test.ts`
- Test: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing launcher tests**

Cover:
- worktree file result selection activates target worktree before file open
- default-mode rows remain scoped to the active worktree for branch files
- labels for linked worktree file hits remain clear

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop vitest run apps/desktop/src/lib/__tests__/workspaceLauncherSearch.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: FAIL if tests assert the stricter sequencing and context labels

- [ ] **Step 3: Implement the minimal launcher adjustments**

Keep the existing `pickFile` contract but verify the flow remains:
- resolve worktree
- `handleSelectWorktree()`
- switch to Files tab
- open file

Avoid mixing old terminology such as `linkedWorktrees` vs `Primary` in user-facing copy where new labels should be clearer.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop vitest run apps/desktop/src/lib/__tests__/workspaceLauncherSearch.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/WorkspaceLauncherModal.vue apps/desktop/src/lib/workspaceLauncherSearch.ts apps/desktop/src/lib/__tests__/workspaceLauncherSearch.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "fix: resolve launcher file opens through active worktree context"
```

### Task 7: Rename Residual UI Terminology and Run Full Verification

**Files:**
- Modify: any touched components still using `ungrouped` or `outside mode` copy
- Test: all impacted suites above

- [ ] **Step 1: Search for stale terminology**

Run: `rg -n "ungrouped|outside mode|outside" apps/desktop/src docs/superpowers/specs`
Expected: identify any remaining user-facing copy or test fixtures that conflict with `Primary`

- [ ] **Step 2: Apply minimal copy cleanup**

Replace user-facing terms with:
- `Primary`
- `linked worktree`
- `context`

Do not rename low-level historical identifiers unless needed for clarity in touched code.

- [ ] **Step 3: Run focused desktop test suites**

Run:

```bash
pnpm --filter desktop vitest run \
  apps/desktop/src/stores/__tests__/workspaceStore.test.ts \
  apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts \
  apps/desktop/src/components/__tests__/ThreadSidebar.test.ts \
  apps/desktop/src/components/__tests__/ThreadRow.test.ts \
  apps/desktop/src/components/__tests__/FileSearchEditor.test.ts \
  apps/desktop/src/lib/__tests__/workspaceLauncherSearch.test.ts
```

Expected: PASS

- [ ] **Step 4: Run broader desktop verification**

Run: `pnpm --filter desktop test`
Expected: PASS, or document unrelated existing failures separately

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src
git commit -m "refactor: finalize primary and linked worktree context UX"
```

## Risks to Watch

- `WorkspaceLayout.vue` already has broad responsibility; avoid folding grouping logic into it when the store can own derivation.
- `FileSearchEditor.vue` currently has correctness issues around worktree switching; fix those before layering on labels or polish.
- Existing dirty worktree state in the current worktree may conflict with any new assumptions about fast context switching; tests must cover cancellation paths.
- There are already unrelated local changes in this repository; execution should isolate commits carefully.

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
