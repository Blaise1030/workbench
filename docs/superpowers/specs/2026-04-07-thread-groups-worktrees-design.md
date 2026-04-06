# Thread Groups (Worktree-Backed) — Design Spec

## Summary

Thread groups let users create isolated workspaces backed by git worktrees. Each group is tied to a branch (existing or new), and threads within a group share that worktree's filesystem. Clicking a thread in a group switches agent, git diff, files, and terminals to the worktree's context. Ungrouped threads operate on the project's main checkout.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Branch selection | User chooses: pick existing branch OR create new branch from a base |
| Sidebar layout | Collapsible sections — ungrouped threads at top, groups below with branch labels |
| Thread creation | Dropdown on existing "+" button: "New Thread" (ungrouped) or "New Thread Group" |
| Branch picker UI | Inline dropdown in sidebar — branch list with "Create new branch..." option |
| Group membership | Fixed at creation time — threads cannot move between groups |
| Terminal cwd | Auto — terminals in a group spawn with cwd set to the worktree path |
| Worktree lifecycle | Thread groups reflect worktree state; if worktree removed externally, user is notified and chooses to keep or delete the group |

## Domain Model Changes

The existing `Worktree` entity already has the right shape (`id`, `projectId`, `branch`, `path`). The change is allowing **multiple worktrees per project** and distinguishing the "default" worktree (main checkout) from "group" worktrees.

### Worktree — add `isDefault` field

```ts
export interface Worktree {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  isActive: boolean;
  isDefault: boolean; // NEW — true for the main checkout, false for group worktrees
  baseBranch?: string | null; // NEW — branch this was created from (for display: "from main")
  lastActiveThreadId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

No changes to `Thread` — threads already have `worktreeId` which determines their group. A thread with `worktreeId` pointing to the default worktree is "ungrouped."

## IPC Changes

### New channels

| Channel | Input | Output | Purpose |
|---------|-------|--------|---------|
| `workspace:createWorktreeGroup` | `CreateWorktreeGroupInput` | `Worktree` | Creates a git worktree and the group entity |
| `workspace:deleteWorktreeGroup` | `{ worktreeId: string }` | `void` | Removes git worktree and all threads in the group |
| `workspace:listBranches` | `{ projectId: string }` | `string[]` | Lists branches for the branch picker |
| `workspace:worktreeHealth` | `{ worktreeId: string }` | `{ exists: boolean }` | Checks if worktree path still exists on disk |

### New types

```ts
export interface CreateWorktreeGroupInput {
  projectId: string;
  /** Existing branch name, or new branch to create. */
  branch: string;
  /** When creating a new branch, the base to branch from. Null if using existing branch. */
  baseBranch: string | null;
}
```

## Sidebar UI Changes

### ThreadSidebar

The sidebar currently renders a flat list of threads. It needs to:

1. **Partition threads** into ungrouped (default worktree) and grouped (by non-default worktree).
2. **Render ungrouped threads** at the top, same as today.
3. **Render each thread group** as a collapsible section:
   - Header: collapse toggle, branch name badge (green), "from {baseBranch}" label, context menu (delete group).
   - Body: indented thread list, same interactions as ungrouped threads (select, rename, reorder, delete).
4. **Collapsed state** persisted per-group (local ref, not stored in DB).

### Thread Create Button

The existing "+" button gets a split-button dropdown:

- **Default click**: creates an ungrouped thread (same as today).
- **Dropdown chevron**: opens menu with "New Thread" and "New Thread Group."

Selecting "New Thread Group" triggers the inline branch picker.

### Branch Picker

Inline UI that appears in the sidebar when creating a thread group:

1. **Branch field**: combo dropdown listing existing branches + "Create new branch..." option at top.
2. **Base branch field**: only visible when "Create new branch..." is selected. Defaults to the project's current branch.
3. **Create / Cancel** buttons.

On "Create": calls `workspace:createWorktreeGroup` IPC. The electron main process runs `git worktree add`. On success, the new group appears in the sidebar.

## Context Switching Behavior

When the user clicks a thread:

1. **Determine the thread's worktree** via `worktreeId`.
2. **If the worktree is different from the current `activeWorktreeId`**:
   - Update `activeWorktreeId` in the store.
   - All panels (agent terminal, git diff, file tree, shell terminals) re-scope to the new worktree's `path`.
   - PTY sessions are keyed by worktree (existing behavior: `__shell:{worktreeId}:{slotId}`), so terminals for that worktree are restored.
3. **If same worktree**: just switch the active thread (existing behavior).

This is mostly how the app already works — the key change is that switching between ungrouped threads and grouped threads (or between groups) will trigger a worktree switch.

## External Worktree Discovery

On startup and after each `workspace:didChange` event, the app runs `git worktree list --porcelain` and reconciles the result against known `Worktree` rows:

1. **Worktrees that exist on disk but not in the DB** (created externally via CLI): create a `Worktree` row with `isDefault: false` and display the group in the sidebar. Since these have no threads, they appear as empty groups.
2. **Empty thread groups** (groups with zero threads, whether discovered externally or after all threads are deleted): silently remove the `Worktree` row from the DB and clean up. They do not appear in the sidebar — there is nothing to show.
3. **Thread groups with threads but a missing worktree** (worktree removed externally while threads still exist): show an inline callout component on the group header in the sidebar warning the user that the worktree is gone. The callout offers "Delete group & threads" to clean up.

This means the sidebar always reflects what actually exists on disk, and empty groups never linger.

## Worktree Health Monitoring

### Detection

On app startup and periodically (every 60 seconds while a project is active), check that each non-default worktree's `path` exists on disk. If not:

1. Mark the worktree as stale in the store (new `isStale: boolean` field, renderer-only state).
2. Show a warning banner on the group header in the sidebar.
3. Clicking the banner or opening the group shows the warning dialog: "Worktree for {branch} was removed outside the app. Keep group (threads preserved, no terminal/file access) or Delete group & threads."

### Keep vs Delete

- **Keep**: threads remain visible but non-functional. Attempting to open a terminal or view files shows "Worktree not found" inline message. User can delete later.
- **Delete**: calls `workspace:deleteWorktreeGroup` which removes all threads in the group and the worktree entity.

## Electron Main Process

### `git worktree add`

When `workspace:createWorktreeGroup` is called:

1. Determine worktree path: `{repoPath}/.worktrees/{sanitized-branch}` where slashes in branch names become dashes (e.g. `feat/auth` → `feat-auth`).
2. If `baseBranch` is provided (new branch): `git worktree add -b {branch} {worktreePath} {baseBranch}`.
3. If `baseBranch` is null (existing branch): `git worktree add {worktreePath} {branch}`.
4. Create the `Worktree` row in the database with `isDefault: false`, `baseBranch`.
5. Return the new worktree entity.

### `git worktree remove`

When `workspace:deleteWorktreeGroup` is called:

1. Run `git worktree remove {worktreePath} --force` (force in case of uncommitted changes — user already confirmed deletion).
2. Delete all `Thread` rows with matching `worktreeId`.
3. Delete the `Worktree` row.
4. If the deleted worktree was `activeWorktreeId`, switch to the default worktree.

### Branch listing

`workspace:listBranches`: runs `git branch --list --format='%(refname:short)'` in the project's repo path.

## Components Affected

| Component | Change |
|-----------|--------|
| `src/shared/domain.ts` | Add `isDefault`, `baseBranch` to `Worktree` |
| `src/shared/ipc.ts` | Add new IPC channels and input types |
| `src/stores/workspaceStore.ts` | Add getters for grouped/ungrouped threads, thread groups |
| `src/components/ThreadSidebar.vue` | Render collapsible groups, inline branch picker |
| `src/components/ThreadCreateButton.vue` | Split-button dropdown: thread vs. thread group |
| `src/layouts/WorkspaceLayout.vue` | Wire up new IPC handlers, pass group data to sidebar |
| `electron/main.ts` (or related) | Implement git worktree IPC handlers |

## Out of Scope

- Merging branches from within the app (use terminal or external tool).
- Renaming thread groups / branches after creation.
- Moving threads between groups.
- Visualizing branch relationships / graph.
