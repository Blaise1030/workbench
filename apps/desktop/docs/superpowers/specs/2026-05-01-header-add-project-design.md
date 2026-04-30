# Header “Add project” control

**Date:** 2026-05-01  
**Status:** Approved

## Overview

Add a **+** control at the end of the top-bar **project tab strip** (in `Layout.vue`). Clicking it opens the **native repository folder picker** (`workspaceApi.pickRepoDirectory()`), then adds the selection as a new workspace project and navigates to it.

## Goals

- One obvious way to add a project from the main workspace chrome without opening the threads sidebar menu.
- Reuse existing IPC: directory dialog + `workspaceApi.addProject`.
- Keep the **+** visible when horizontal tabs overflow (do not place it only inside the scrolling region).

## Non-goals

- In-app modal listing “recent folders” (can be a follow-up).
- Opening the full workspace launcher as the primary path (optional future enhancement).

## UX

### Placement

- Layout: `[ back/forward | …scrollable project tabs… | + | feedback | settings | … ]`.
- The **+** sits **immediately after** the scrollable tab container as a **sibling** (`shrink-0`), so it stays pinned while tabs scroll.

### Control

- `Button`, `variant="outline"`, `size="icon-sm"`, icon `PlusIcon` (or equivalent already used in the layout).
- `aria-label`: **Add project** (or **Add repository** if product copy prefers).
- `title` / tooltip optional but consistent with adjacent header buttons.
- `data-testid`: e.g. `header-add-project` for automated tests.

### Flow

1. User clicks **+**.
2. Call `workspaceApi.pickRepoDirectory()`. If the result is `null` (cancelled), **stop** (no state change).
3. **Duplicate guard:** If any existing project in the current workspace snapshot has the same `repoPath` after normalisation (compare resolved strings appropriate to the platform, or consistent normalisation such as trailing slash removal), **do not** call `addProject`. Show user feedback using the same surface the app uses for transient errors (e.g. sonner toast): message such as “This folder is already in the workspace.”
4. Derive **display name** from `repoPath` (e.g. final path segment via `basename`-style logic); trim if needed.
5. Call `workspaceApi.addProject({ name, repoPath })` (optional `defaultBranch` only if the codebase already passes it from similar flows; otherwise omit and rely on main-process defaults).
6. **Refresh** client state used by the tab bar: invalidate TanStack Query keys that back project tabs / snapshot (at minimum `projectTabs`, and any others required so worktrees/path stay coherent—mirror what `navigateToProject` already invalidates after a switch).
7. **Navigate** to the new project using the same helper as switching projects (`useNavigateToProject` or equivalent), so route params and persisted workspace selection stay correct.

### Errors

- If `addProject` rejects (I/O, validation, or future server-side rules), show feedback through the same mechanism as other workspace failures; do not leave partial UI state.

## Architecture

### Primary location

- **`apps/desktop/src/layouts/Layout.vue`**: markup for **+**, click handler, query invalidation, navigation.

### Optional refactor (YAGNI unless duplication hurts)

- Extract **`useAddProjectFromDirectoryPick()`** (or similar) in `src/composables/` if the same sequence should power ThreadSidebar’s “Add project” (`createProject` emit) in a follow-up. Not required for the first ship if only the header uses it.

## Dependencies (existing)

- `window.workspaceApi.pickRepoDirectory()` → Electron `dialog:pickRepoDirectory` (“Select repository folder”).
- `window.workspaceApi.addProject(payload)` → `workspace:addProject` (creates project + default worktree in main process per current behaviour).

## Testing

- **Component or unit test** (Vitest + Vue Test Utils): mount the layout shell relevant to the header **or** a thin wrapper around the handler:
  - Mock `pickRepoDirectory` to return a path; mock `addProject` to resolve with a snapshot containing the new project id; assert `addProject` called with expected `name`/`repoPath`; assert navigation / invalidation hooks invoked as designed.
  - Mock `pickRepoDirectory` → `null`: assert `addProject` **not** called.
  - Duplicate path: assert `addProject` **not** called and error feedback path invoked (mock toast/composable if needed).

## Self-review checklist

- [x] No unresolved TBDs.
- [x] Duplicate path behaviour specified explicitly.
- [x] Scope limited to header + native picker + add + navigate.
- [x] Aligns with existing `Layout.vue` tab strip and `useNavigateToProject` invalidation pattern.
