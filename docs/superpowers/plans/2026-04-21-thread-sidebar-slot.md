# Thread Sidebar Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the branch picker, "Threads from this branch only" filter, and center panel tabs from the top of the sidebar into the primary context group by adding a `header-extra` named slot to `ThreadSidebarNodes`.

**Architecture:** Add a `<slot name="header-extra" />` in `ThreadSidebarNodes.vue` between the context header row and the thread list `<ul>`. `ThreadSidebar.vue` passes the branch picker, filter toggle, and tabs into this slot only for the primary node, then removes the now-redundant top-level block.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vitest + `@vue/test-utils`

---

## File Map

| File | Change |
|------|--------|
| `apps/desktop/src/components/ThreadSidebarNodes.vue` | Add `<slot name="header-extra" />` after context header, before `<ul>` |
| `apps/desktop/src/components/ThreadSidebar.vue` | Pass `#header-extra` slot content for primary node; remove top-level controls block |
| `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts` | Update/add tests for new slot-based layout |

---

### Task 1: Add `header-extra` slot to `ThreadSidebarNodes`

**Files:**
- Modify: `apps/desktop/src/components/ThreadSidebarNodes.vue:207-209`

- [ ] **Step 1: Add the slot**

In `ThreadSidebarNodes.vue`, after the closing tag of the non-context-menu header `</div>` (line 207) and before the `<ul v-show="isExpanded"` (line 209), insert:

```html
    <slot name="header-extra" />

    <ul
```

The full diff at that location (lines 207–211 after edit):

```html
    </div>

    <slot name="header-extra" />

    <ul
      v-show="isExpanded"
      class="ml-2.5 space-y-0.5 border-l border-border pl-2"
```

- [ ] **Step 2: Verify no TypeScript errors**

Run:
```bash
cd /Users/blaisetiong/Developer/instrument
pnpm --filter desktop tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/ThreadSidebarNodes.vue
git commit -m "feat(sidebar): add header-extra slot to ThreadSidebarNodes"
```

---

### Task 2: Pass slot content in `ThreadSidebar` for the primary node

**Files:**
- Modify: `apps/desktop/src/components/ThreadSidebar.vue:860-874`

- [ ] **Step 1: Update the `ThreadSidebarNodes` loop to pass the slot**

Find the `<ThreadSidebarNodes` block (lines 860–874). Replace it with:

```html
          <ThreadSidebarNodes
            v-for="node in primarySidebarNodes"
            :key="node.id"
            :node="node"
            :expanded-contexts="expandedContexts"
            :collapsed="collapsed"
            @toggle-context="toggleGroup"
            @add-thread="emit('addThreadInline', $event)"
            @delete-context="(id) => emit('deleteWorktreeGroup', id)"
            @expand-thread-list="expandThreadListForGroup"
            @collapse-thread-list="collapseThreadListForGroup"
            @select-thread="emit('select', $event)"
            @remove-thread="emit('remove', $event)"
            @rename-thread="(id, title) => emit('rename', id, title)"
          >
            <template v-if="node.kind === 'context' && node.isPrimary" #header-extra>
              <div class="flex flex-col gap-2 px-1 pb-1">
                <div class="flex min-w-0 items-start">
                  <ScmBranchCombobox
                    v-if="showToolbarBranchSwitcher"
                    variant="toolbar"
                    :branch-line="scmBranchLine"
                    :current-branch="scmCurrentBranch"
                    :project-id="projectId ?? ''"
                    :cwd="scmCwd"
                    switcher-enabled
                    @branch-changed="emit('branchChanged')"
                  />
                  <Badge
                    v-else-if="contextLabel"
                    variant="outline"
                    class="shrink-0 text-[10px] text-muted-foreground"
                  >
                    {{ contextLabel }}
                  </Badge>
                </div>
                <div
                  v-if="branchFilterAvailable"
                  class="flex items-center gap-2 px-2"
                  title="Threads created on the checked-out branch in each group."
                >
                  <Switch
                    id="thread-sidebar-filter-current-branch"
                    v-model="filterByCurrentBranch"
                    class="shrink-0"
                    data-testid="thread-sidebar-filter-current-branch"
                    aria-label="Threads from this branch only"
                  />
                  <label
                    class="min-w-0 user-select-none cursor-pointer text-left text-[11px] leading-snug text-muted-foreground"
                    for="thread-sidebar-filter-current-branch"
                  >
                    Threads from this branch only
                  </label>
                </div>
                <div v-if="activeThreadId" class="w-full">
                  <PillTabs
                    v-model="centerPanelTab"
                    variant="segmented"
                    :tabs="centerPanelTabs"
                    aria-label="Center panel"
                  />
                </div>
              </div>
            </template>
          </ThreadSidebarNodes>
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter desktop tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/ThreadSidebar.vue
git commit -m "feat(sidebar): inject branch picker and tabs into primary group slot"
```

---

### Task 3: Remove the now-redundant top-level controls block

**Files:**
- Modify: `apps/desktop/src/components/ThreadSidebar.vue:785-833`

- [ ] **Step 1: Delete the top-level controls block**

Remove lines 785–832 (the `<div class="flex flex-col gap-2">` block that contains the branch combobox, filter switch, and PillTabs). The section that remains inside `<div class="flex flex-col items-flex w-full min-w-0 gap-1">` should contain only the `ContextQueueReviewDropdown`:

```html
      <div class="flex w-full min-w-0 flex-col gap-1">
        <ContextQueueReviewDropdown
          v-if="activeThreadId && contextQueueItems.length > 0"
          ref="contextQueueReviewRef"
          :thread-id="activeThreadId"
          :items="contextQueueItems"
          :worktree-path="contextQueueWorktreePath"
          @confirm="emit('contextQueueConfirm', $event)"
          @persist-draft="emit('contextQueuePersistDraft', $event)"
        />
      </div>
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter desktop tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run the app and visually verify**

Start the dev server:
```bash
pnpm --filter desktop dev
```

Check:
1. Primary group (⭐️ main): branch combobox + filter toggle appear below the header row.
2. No thread selected: PillTabs are hidden.
3. Select a thread: PillTabs appear below the filter toggle.
4. Non-primary worktree group: no branch combobox, no filter, no tabs.
5. Top of sidebar no longer shows the old controls block.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/ThreadSidebar.vue
git commit -m "refactor(sidebar): remove top-level branch picker and tabs block"
```

---

### Task 4: Update tests

**Files:**
- Modify: `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`

- [ ] **Step 1: Run existing tests to see what breaks**

```bash
pnpm --filter desktop test --run ThreadSidebar
```

Note which tests fail. The likely failures are tests that look for `data-testid="thread-sidebar-filter-current-branch"` or the PillTabs at the top-level — they still exist but may now require the primary context group to be expanded first.

- [ ] **Step 2: Fix any failing test that checks branch filter visibility**

If a test asserts the filter switch is visible without expanding the primary group, add an expand step. Locate the primary group header via `data-testid="thread-group-header"` and click it before asserting:

```ts
// Expand primary context group first
await wrapper.get('[data-testid="thread-group-header"]').trigger('click');
await nextTick();

expect(wrapper.find('[data-testid="thread-sidebar-filter-current-branch"]').exists()).toBe(true);
```

- [ ] **Step 3: Add a test — tabs hidden when no thread selected**

In the `describe` block for `ThreadSidebar`, add:

```ts
it('hides center panel tabs when no thread is selected', async () => {
  const wrapper = mountThreadSidebar({
    threads: [makeThread({ id: 't1', worktreeId: null })],
    activeThreadId: null,
    threadContexts: [makeContext({ isDefault: true, threads: [makeThread({ id: 't1', worktreeId: null })] })],
    centerPanelTabs: [{ value: 'agent', label: 'Agent' }],
  });
  // Expand primary group
  await wrapper.get('[data-testid="thread-group-header"]').trigger('click');
  await nextTick();
  expect(wrapper.find('[aria-label="Center panel"]').exists()).toBe(false);
});
```

- [ ] **Step 4: Add a test — tabs visible when thread is selected**

```ts
it('shows center panel tabs when a thread is selected', async () => {
  const thread = makeThread({ id: 't1', worktreeId: null });
  const wrapper = mountThreadSidebar({
    threads: [thread],
    activeThreadId: 't1',
    threadContexts: [makeContext({ isDefault: true, threads: [thread] })],
    centerPanelTabs: [{ value: 'agent', label: 'Agent' }],
  });
  // Expand primary group
  await wrapper.get('[data-testid="thread-group-header"]').trigger('click');
  await nextTick();
  expect(wrapper.find('[aria-label="Center panel"]').exists()).toBe(true);
});
```

- [ ] **Step 5: Run tests — verify all pass**

```bash
pnpm --filter desktop test --run ThreadSidebar
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/__tests__/ThreadSidebar.test.ts
git commit -m "test(sidebar): update tests for slot-based branch picker and tabs"
```
