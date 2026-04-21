# Thread Sidebar Slot Design

**Date:** 2026-04-21  
**Status:** Approved

## Summary

Move the branch picker, "Threads from this branch only" filter toggle, and center panel tabs (Agent / Git / Files / Browser) from the top of the sidebar into the primary context group, rendered just below the `ThreadGroupHeader`. This tightens the layout and scopes these controls to the context they belong to.

## Current Layout

```
ThreadTopBar
Project switcher
ContextQueueReviewDropdown
ScmBranchCombobox  (or contextLabel Badge)
Switch + label: "Threads from this branch only"
PillTabs: Agent | Git | Files | Browser
─────────────────────────────────────────
⭐️ main  [+]
  TODAY
  thread 1
  thread 2
🌳 worktree-a  [+]
  thread 3
```

## Desired Layout

```
ThreadTopBar
Project switcher
ContextQueueReviewDropdown
─────────────────────────────────────────
⭐️ main  [+]
  ScmBranchCombobox  (or contextLabel Badge)
  Switch: "Threads from this branch only"
  PillTabs: Agent | Git | Files | Browser   ← only when activeThreadId is set
  TODAY
  thread 1
  thread 2
🌳 worktree-a  [+]
  thread 3
```

## Architecture

### 1. `ThreadSidebarNodes.vue` — add `header-extra` slot

Inside the `<li v-if="node.kind === 'context'">` block, insert a named slot between the header row and the `<ul>` thread list:

```html
<!-- after the header div / ContextMenu -->
<slot name="header-extra" />
<!-- existing <ul v-show="isExpanded"> -->
```

No new props required. The slot is a generic render hook; content is supplied entirely by the parent.

### 2. `ThreadSidebar.vue` — pass slot content for primary node

In the `v-for` loop over `primarySidebarNodes`, pass a `#header-extra` template scoped to the primary node only:

```html
<ThreadSidebarNodes
  v-for="node in primarySidebarNodes"
  :key="node.id"
  ...
>
  <template v-if="node.isPrimary" #header-extra>
    <!-- Always shown for primary group -->
    <ScmBranchCombobox v-if="showToolbarBranchSwitcher" ... />
    <Badge v-else-if="contextLabel" ... />

    <div v-if="branchFilterAvailable" class="flex items-center gap-2 px-2">
      <Switch v-model="filterByCurrentBranch" ... />
      <label ...>Threads from this branch only</label>
    </div>

    <!-- Shown only when a thread is selected -->
    <div v-if="activeThreadId" class="w-full px-1">
      <PillTabs v-model="centerPanelTab" :tabs="centerPanelTabs" ... />
    </div>
  </template>
</ThreadSidebarNodes>
```

All existing prop bindings and event handlers on these controls remain unchanged.

### 3. `ThreadSidebar.vue` — remove top-level controls block

Remove the `<div class="flex flex-col gap-2">` block that currently renders the branch combobox, filter switch, and PillTabs above the thread list. After removal the outer wrapper `<div class="flex flex-col items-flex w-full min-w-0 gap-1">` only needs to contain the `ContextQueueReviewDropdown`.

## Data Flow

No data flow changes. All state (`filterByCurrentBranch`, `centerPanelTab`, `activeThreadId`, `scmBranchLine`, etc.) already lives in `ThreadSidebar` and is passed via the slot template's bindings. `ThreadSidebarNodes` remains stateless with respect to these controls.

## Affected Files

| File | Change |
|------|--------|
| `apps/desktop/src/components/ThreadSidebarNodes.vue` | Add `<slot name="header-extra" />` in context node template |
| `apps/desktop/src/components/ThreadSidebar.vue` | Move branch picker / filter / tabs into `#header-extra` slot; remove top-level controls block |

## Out of Scope

- Non-primary worktree groups: no slot content passed, behavior unchanged.
- Collapsed sidebar state: controls already hidden when `collapsed` is true; no change needed.
- Tests: `ThreadSidebar.test.ts` may need minor updates if it asserts on the position of these controls.
