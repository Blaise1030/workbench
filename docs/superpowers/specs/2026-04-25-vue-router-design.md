# Vue Router Integration Design

**Date:** 2026-04-25  
**Status:** Approved

## Overview

Introduce Vue Router (memory history) as the single source of truth for active project, worktree branch, panel, and thread navigation. Replaces the current state-driven approach (`mainCenterTab` ref, `workspaceStore.activeThreadId`, etc.) with URL-addressable routes.

## Route Shape

```
/                                          → Welcome (no project open)
/:projectId/:branch/thread/:threadId       → Agent panel (active thread)
/:projectId/:branch/git                    → Git panel
/:projectId/:branch/files                  → Files panel
/:projectId/:branch/files/:filename+       → File open in editor
```

`:filename+` captures paths containing `/` (e.g. `src/components/Foo.vue`).  
`:branch` is encoded with `encodeURIComponent` on write and decoded on read, since branch names can contain `/`.

**History mode:** `createMemoryHistory()` — required for Electron (no address bar).

## Source of Truth Migration

| State | Before | After |
|---|---|---|
| Active panel | `mainCenterTab` ref in `WorkspaceLayout` | route name / path segment |
| Active thread | `workspaceStore.activeThreadId` | `route.params.threadId` |
| Active worktree | `workspaceStore.activeWorktreeId` | resolved from `route.params.branch` |
| Active project | `workspaceStore.activeProjectId` | `route.params.projectId` |

`workspaceStore` retains project, worktree, and thread *data* (lists) but drops the four `active*` id refs. Computed getters (`activeProject`, `activeThread`, `activeWorktree`) become composables that call `useRoute()` and look up by param.

## Architecture

### New files

- `src/router/index.ts` — route definitions, `createRouter`, named views, global navigation guard
- `src/test-utils/createTestRouter.ts` — helper for test setup with `createMemoryHistory`

### Modified files

- `apps/desktop/src/main.ts` — `app.use(router)` alongside Pinia
- `apps/desktop/src/App.vue` — thin shell with `<RouterView />`; welcome screen and `WorkspaceLayout` rendered by router
- `apps/desktop/src/layouts/WorkspaceLayout.vue` — `mainCenterTab` ref removed; center panel becomes `<RouterView name="panel">`; panel switching uses `router.push()`
- `apps/desktop/src/stores/workspaceStore.ts` — remove `activeProjectId`, `activeWorktreeId`, `activeThreadId` refs; re-express computed getters using `useRoute()`
- `apps/desktop/src/composables/useThreadNavigation.ts` — `goPrevThread`/`goNextThread` call `router.push()` instead of `handleSelectThread`

### View components (routed)

Each center panel becomes its own route component rather than a `v-show` block:

| Route | Component |
|---|---|
| `/:projectId/:branch/thread/:threadId` | `AgentPane.vue` |
| `/:projectId/:branch/git` | `SourceControlPanel.vue` |
| `/:projectId/:branch/files` | `FileSearchEditor.vue` |
| `/:projectId/:branch/files/:filename+` | `MonacoEditor.vue` |

## Navigation

All navigation calls become `router.push()`:

```ts
// Select thread
router.push({ name: 'thread', params: { projectId, branch: encodeBranch(branch), threadId } })

// Switch panel
router.push({ name: 'git', params: { projectId, branch: encodeBranch(branch) } })

// Open file
router.push({ name: 'file', params: { projectId, branch: encodeBranch(branch), filename: filePath } })
```

A `encodeBranch` / `decodeBranch` helper wraps `encodeURIComponent` / `decodeURIComponent`.

## Navigation Guard

A global `beforeEach` guard:

1. Checks `:projectId` exists in `workspaceStore.projects` — redirects to `/` if not.
2. Checks decoded `:branch` matches a known worktree branch — redirects to the primary worktree's route if not.
3. Checks `:threadId` exists in the thread list — redirects to the first available thread in the worktree, or `/:projectId/:branch/files` if no threads exist.

## Edge Cases

**New project (no threads yet):** Guard redirects to `/:projectId/:branch/files` when no thread exists rather than `/thread/new`.

**Thread deleted while active:** A watcher on the thread list triggers `router.replace()` to the next available thread in the same worktree, or `/:projectId/:branch/files` if none remain.

**Worktree deleted while active:** Navigation guard detects the branch no longer exists and redirects to the primary worktree route, or `/` if no worktrees remain.

**Branch names with `/`:** `encodeBranch(name)` → `encodeURIComponent(name)` on push; `decodeBranch(param)` → `decodeURIComponent(param)` on read. All route param reads go through `decodeBranch`.

## Testing

- Existing tests that mock `workspaceStore.activeThreadId` / `mainCenterTab` updated to use `createTestRouter(initialRoute)` from `src/test-utils/`.
- `@vue/test-utils` RouterLink stub replaced with real router in integration tests.
- `createTestRouter` accepts an initial route string and returns a configured memory-history router for mounting in tests.

## Out of Scope

- URL persistence across Electron restarts (the memory history resets on app launch; last-active state is already persisted by `workspaceStore` via localStorage and restored on boot).
- Browser-style back/forward UI controls.
