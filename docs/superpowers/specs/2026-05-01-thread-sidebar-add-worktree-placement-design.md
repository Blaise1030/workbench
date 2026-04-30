# Thread Sidebar — Add Worktree Row Placement (After First Primary Group)

**Date:** 2026-05-01  
**Status:** Draft (pending implementation-plan phase)

## Summary

In `ThreadSidebar.vue`, keep the **Add worktree** control (`Popover` + `BranchPicker`) and its divider chrome **only after the first primary context group** (`ThreadSidebarNodes` for the first `primarySidebarNodes` entry). Any **additional** non-worktree sidebar nodes (if the data model ever yields more than one) render **below** that row, so the insert row never sits between two primary-adjacent groups.

**Scope:** `ThreadSidebar.vue` only. **`Layout.vue`** and other shells are unchanged.

## Motivation

Today a single `v-for="node in primarySidebarNodes"` renders all primary-context nodes, then the add-worktree `<li>`, then worktree nodes. That is correct when there is exactly one primary node. If `primarySidebarNodes` ever contains multiple entries, the add-worktree row would appear only after **all** of them, which violates the product rule: **divider + Add worktree immediately after the first collapsible primary group**.

## Desired DOM Order

1. `ThreadSidebarNodes` for **`primarySidebarNodes[0]`** (when present), including `#header-extra` and all existing emits/handlers.
2. **Divider + Add worktree** `<li>` (unchanged behavior: `projectId`, `!collapsed`, popover, test ids, `createWorktreeGroup` emit).
3. `ThreadSidebarNodes` for **`primarySidebarNodes.slice(1)`** (when non-empty).
4. `ThreadSidebarNodes` for **`worktreeSidebarNodes`** (unchanged).

## Implementation Notes

### Computed splits (script)

Add two computeds derived from existing `primarySidebarNodes`:

- `primarySidebarNodeFirst`: `primarySidebarNodes[0] ?? null` (or equivalent reactive access).
- `primarySidebarNodesAfterFirst`: `primarySidebarNodes.slice(1)`.

No changes to how `primarySidebarNodes` is built (`contextGroups` / filters).

### Template (markup)

- Replace the single `v-for="node in primarySidebarNodes"` block with:
  - One `ThreadSidebarNodes` instance keyed by `primarySidebarNodeFirst.id` when `primarySidebarNodeFirst` is non-null, passing the same props and `@` handlers as today, preserving the `#header-extra` template (conditions unchanged: primary vs active thread for pills).
  - The existing add-worktree `<li>` block (unchanged logic unless spacing classes need a tweak for the new structure).
  - `v-for="node in primarySidebarNodesAfterFirst"` with identical `ThreadSidebarNodes` wiring as the original loop (except slot: only primary-specific `header-extra` applies to `node.isPrimary`; non-primary entries in this slice are unlikely but should keep the same `v-if` rules as the current loop).

### Edge Case: No First Primary Node

If `primarySidebarNodes` is empty, **do not** render a `ThreadSidebarNodes` for step 1. Still render the add-worktree row when `projectId && !collapsed` (same as today), then worktree groups. This matches rare empty-primary states without introducing new visibility rules.

## Behavior & IPC

No changes: `BranchPicker` `@create` → `emit('createWorktreeGroup', branch, baseBranch)`; popover open/close handlers unchanged.

## Testing

Update `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts` if needed so that:

- With a single primary node, behavior and **DOM order** remain equivalent to today (add-worktree row immediately after that group).
- **Required:** single-primary regression (add-worktree row still present, same testids, same emits on create).
- **Optional:** when the workspace model can surface two non-worktree context nodes, add a test that the add-worktree `<li>` sits **between** the first and second primary `ThreadSidebarNodes` blocks. Until then, the split template is the guarantee.

Preserve existing `data-testid` values (`thread-sidebar-worktree-insert`, `thread-sidebar-footer-worktree-toggle`, `thread-sidebar-worktree-popover`) unless a deliberate rename is agreed separately.

## Out of Scope

- `Layout.vue` sidebar / `threadsGroup` migration.
- New IPC or workspace APIs.
- Visual redesign of `BranchPicker` beyond minor spacing tied to the split layout.
