# Thread Sidebar — Add Worktree Row After First Primary Group

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `ThreadSidebar.vue` rendering so the add-worktree `<li>` sits after the **first** primary context `ThreadSidebarNodes` block and before any **additional** non-worktree nodes and linked worktrees, matching `docs/superpowers/specs/2026-05-01-thread-sidebar-add-worktree-placement-design.md`.

**Architecture:** Two computeds (`primarySidebarNodeFirst`, `primarySidebarNodesAfterFirst`) derive from the existing `primarySidebarNodes` computed. The template renders (1) optional first `ThreadSidebarNodes`, (2) unchanged add-worktree row, (3) `v-for` over the remainder, (4) existing worktree `ThreadSidebarNodes` loop. No changes to grouping logic, IPC, or `ThreadSidebarNodes.vue`.

**Tech stack:** Vue 3 (`<script setup>`), TypeScript, Vitest, existing `ThreadSidebar.test.ts`.

---

## File map

| File | Role |
|------|------|
| `apps/desktop/src/components/ThreadSidebar.vue` | Add computeds; replace primary-group template block |
| `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts` | Regression only if assertions break (unlikely) |
| `docs/superpowers/specs/2026-05-01-thread-sidebar-add-worktree-placement-design.md` | Source spec (read-only) |

---

### Task 1: Add first / rest computeds

**Files:**

- Modify: `apps/desktop/src/components/ThreadSidebar.vue` (script, immediately after `primarySidebarNodes` computed, ~628–630)

**Steps:**

- [ ] **Step 1: Insert computeds**

After the existing `primarySidebarNodes` computed (the one that ends with `sidebarNodes.value.filter((node) => !node.isWorktree)`), add:

```typescript
const primarySidebarNodeFirst = computed<ContextNode | null>(() => primarySidebarNodes.value[0] ?? null);

const primarySidebarNodesAfterFirst = computed<ContextNode[]>(() => primarySidebarNodes.value.slice(1));
```

`ContextNode` is already defined in this file as `Extract<ThreadSidebarNodeData, { kind: "context" }>` — do not duplicate the type.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm run typecheck
```

Expected: PASS (computeds unused until Task 2 is fine; if TS flags unused, proceed to Task 2 in the same commit).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/ThreadSidebar.vue
git commit -m "refactor(sidebar): add primary first/rest computeds for thread list"
```

---

### Task 2: Split primary `ThreadSidebarNodes` template

**Files:**

- Modify: `apps/desktop/src/components/ThreadSidebar.vue` (template inside `ul.min-w-0.space-y-2`, ~826–896)

**Steps:**

- [ ] **Step 1: Replace the single `v-for="node in primarySidebarNodes"` block**

Locate the opening:

```vue
<ThreadSidebarNodes
  v-for="node in primarySidebarNodes"
  :key="node.id"
```

through the closing `</ThreadSidebarNodes>` that appears **immediately before** the `<li` with `data-testid="thread-sidebar-worktree-insert"`.

Delete that entire `ThreadSidebarNodes` + `v-for` block and substitute the following blocks in this **exact order** (common mistake: putting the add-worktree `<li>` after Block B instead of between A and B):

1. **Block A** — first primary node only  
2. **Add-worktree `<li>`** — unchanged (move it here from its old position after the full primary loop)  
3. **Block B** — `v-for="node in primarySidebarNodesAfterFirst"`  
4. Existing `worktreeSidebarNodes` loop (unchanged)

**Block A — first primary node only**

```vue
          <ThreadSidebarNodes
            v-if="primarySidebarNodeFirst"
            :key="primarySidebarNodeFirst.id"
            :node="primarySidebarNodeFirst"
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
            <template
              v-if="primarySidebarNodeFirst.kind === 'context' && (primarySidebarNodeFirst.isPrimary || primarySidebarNodeFirst.threads.some((t) => t.isActive))"
              #header-extra
            >
              <div class="flex flex-col gap-2 px-1 py-1">
                <template v-if="primarySidebarNodeFirst.isPrimary">
                  <div v-if="!hasActiveWorktreeThread" class="flex min-w-0 items-start">
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
                </template>
                <div v-if="primarySidebarNodeFirst.threads.some((t) => t.isActive)" class="w-full pt-1">
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

**Block B — remaining primary nodes**

```vue
          <ThreadSidebarNodes
            v-for="node in primarySidebarNodesAfterFirst"
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
            <template
              v-if="node.kind === 'context' && (node.isPrimary || node.threads.some((t) => t.isActive))"
              #header-extra
            >
              <div class="flex flex-col gap-2 px-1 py-1">
                <template v-if="node.isPrimary">
                  <div v-if="!hasActiveWorktreeThread" class="flex min-w-0 items-start">
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
                      id="thread-sidebar-filter-current-branch-rest"
                      v-model="filterByCurrentBranch"
                      class="shrink-0"
                      data-testid="thread-sidebar-filter-current-branch-secondary"
                      aria-label="Threads from this branch only"
                    />
                    <label
                      class="min-w-0 user-select-none cursor-pointer text-left text-[11px] leading-snug text-muted-foreground"
                      for="thread-sidebar-filter-current-branch-rest"
                    >
                      Threads from this branch only
                    </label>
                  </div>
                </template>
                <div v-if="node.threads.some((t) => t.isActive)" class="w-full pt-1">
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

**Important:** In Block B, the `Switch` **must not** reuse `id="thread-sidebar-filter-current-branch"` if two primary blocks could both render that switch in the same document (invalid HTML). Use a suffix for the **rest** block only (`id` / `for` pair `thread-sidebar-filter-current-branch-rest` as shown). Block A keeps the original `id` / `for` so existing tests that target `#thread-sidebar-filter-current-branch` or `data-testid="thread-sidebar-filter-current-branch"` keep targeting the first (and in practice only) primary row.

If `primarySidebarNodesAfterFirst` is always empty in production, the duplicate `id` issue never surfaces — the distinct ids still satisfy HTML validity if the slice ever gains entries.

- [ ] **Step 2: Leave add-worktree `<li>` and worktree loop unchanged (but move `<li>` between Block A and Block B)**

The add-worktree row must sit **after Block A and before Block B** (not after Block B). Do not alter popover / `BranchPicker` props or `data-testid` values on that row.

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/ThreadSidebar.vue
git commit -m "refactor(sidebar): render add-worktree row after first primary group only"
```

---

### Task 3: Verify ThreadSidebar tests

**Files:**

- Read-only: `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`
- Modify only if a test fails after Task 2

**Steps:**

- [ ] **Step 1: Run ThreadSidebar tests**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm exec vitest run src/components/__tests__/ThreadSidebar.test.ts
```

Expected: all tests PASS. Pay special attention to `renders the add-worktree control between primary and worktree groups` (expects top-level `ul` child order `w-default`, `insert`, `w-feat`).

- [ ] **Step 2: If any test fails, fix minimally**

Typical failure: duplicate `id` in DOM if both first and rest rendered the same `Switch` id — adjust Block B ids as in Task 2 or ensure only one block renders the filter for the active scenario.

- [ ] **Step 3: Commit (only if tests or test file changed)**

```bash
git add apps/desktop/src/components/__tests__/ThreadSidebar.test.ts
git commit -m "test(sidebar): align ThreadSidebar tests with primary split"
```

---

### Task 4: Optional two-primary DOM test (skip if YAGNI)

**Files:**

- Modify: `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`

**Steps:**

- [ ] **Step 1: Only add this if the product can surface two `primarySidebarNodes` entries**

Re-read `contextGroups` / `sidebarNodes` in `ThreadSidebar.vue`. If the data model cannot produce two `!node.isWorktree` entries, **skip this task** per spec.

- [ ] **Step 2: If added, mount with props that yield two primary-like context nodes and assert**

Top-level `ul` children: `[firstPrimaryId, "insert", secondPrimaryId, ...worktrees]`.

---

## Plan self-review

| Spec section | Covered by |
|--------------|------------|
| Desired DOM order 1–4 | Tasks 1–2 |
| Edge case empty `primarySidebarNodes` | `v-if="primarySidebarNodeFirst"` skips block A; add-worktree `<li>` unchanged |
| Behavior & IPC unchanged | No edits to emits or `BranchPicker` |
| Testing | Task 3 (+ optional Task 4) |
| Out of scope | No Layout / IPC / redesign tasks |

**Placeholder scan:** None intentional; Task 2 documents concrete Vue markup.

**Type consistency:** `ContextNode` matches `primarySidebarNodes` element type.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-01-thread-sidebar-add-worktree-placement.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

If **Subagent-Driven:** use **superpowers:subagent-driven-development** (fresh subagent per task + two-stage review).

If **Inline:** use **superpowers:executing-plans**.
