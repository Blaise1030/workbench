# Layout Migration Spec — Router-Driven Panels via Layout.vue

## Goal

Migrate the workspace from the monolithic `WorkspaceLayout.vue` to a fully router-driven architecture using `Layout.vue` as the persistent shell. Each panel (Thread/Agent, Git, Browser, Files) becomes an independent page component loaded through `useAppContext()`. `WorkspaceLayout.vue` is deleted at the end of this migration.

---

## Current State

```
/ → WelcomePage
/:projectId/:branch → Layout.vue (shell)
  thread/new → CreateNewThread.vue
  thread/:threadId → WorkspaceLayout.vue  ← monolith (all panels live here)
    git → WorkspaceLayout.vue (re-used, wrong)
    preview → WorkspaceLayout.vue (re-used, wrong)
    files → WorkspaceLayout.vue (re-used, wrong)
    files/:filename+ → WorkspaceLayout.vue (re-used, wrong)
```

`WorkspaceLayout.vue` owns: thread sidebar, tab pill navigation, agent terminal pane, git/source control panel, file explorer, browser preview, terminal overlay, context queue, keybindings, and all IPC wiring. ~700+ lines.

---

## Target State

```
/ → WelcomePage
/:projectId/:branch → Layout.vue (sidebar shell + <RouterView />)
  thread/new → CreateNewThread.vue (unchanged)
  thread/:threadId → ThreadLayout.vue  ← NEW thin layout: header + tab pills + <RouterView />
    '' (redirect → agent)
    agent → AgentPage.vue   [src/modules/agent/AgentPage.vue]
    git → GitPage.vue       [src/modules/git/GitPage.vue]
    preview → BrowserPage.vue [src/modules/browser/BrowserPage.vue]
    files → ExplorerPage.vue  [src/modules/explorer/ExplorerPage.vue]
    files/:filename+ → ExplorerPage.vue (same, reads :filename param)
```

**Rule:** Every module page calls `useAppContext()` to load services. No props passed down from parent layouts. No reuse of WorkspaceLayout internals.

---

## New Route Tree (`src/router/index.ts`)

```ts
{
  path: "/:projectId/:branch",
  name: "workspace",
  component: Layout,
  children: [
    { path: "thread/new", name: "threadNew", component: CreateNewThread },
    {
      path: "thread/:threadId",
      component: ThreadLayout,           // NEW
      children: [
        { path: "", redirect: { name: "agent" } },
        { path: "agent", name: "agent", component: AgentPage },
        { path: "git", name: "gitPanel", component: GitPage },
        { path: "preview", name: "previewPanel", component: BrowserPage },
        {
          path: "files",
          name: "filesPanel",
          component: ExplorerPage,
          children: [
            { path: ":filename+", name: "fileDetail", component: ExplorerPage }
          ]
        }
      ]
    }
  ]
}
```

Remove the `"git"` top-level named route (currently aliased to `Layout`). Fix `beforeEach` guard to use `"agent"` as the default panel fallback instead of `"files"`.

---

## Files to Create / Modify

### 1. `src/layouts/ThreadLayout.vue` — NEW

Thin layout. Owns:
- Thread header bar (thread title, branch label)
- Tab pill navigation (Agent / Git / Browser / Files) — drives `router.push` per tab
- `<RouterView />` for the active panel page
- Reads active thread from `useActiveWorkspace()` and `useAppContext()` — no props

Tab-to-route mapping:
```
agent   → { name: "agent",       params }
git     → { name: "gitPanel",    params }
preview → { name: "previewPanel", params }
files   → { name: "filesPanel",  params }
```

Active tab derived from `route.name`.

### 2. `src/modules/agent/AgentPage.vue` — NEW (replace deleted stub)

Owns the agent terminal interaction for a single thread. Calls `useAppContext()` to get `threadManagementService`. Reads `threadId`, `projectId`, `branch` from route params. Renders the pty terminal session for the active thread. No props; fully self-contained.

### 3. `src/modules/git/GitPage.vue` — REPLACE stub

Owns the source control diff view. Calls `useAppContext()` to get `gitService`. Reads `projectId` + `branch` from route params to resolve the worktree path. Renders the diff/staging UI. No props.

### 4. `src/modules/browser/BrowserPage.vue` — NEW

Owns the embedded browser/preview webview. Calls `useAppContext()` to get `gitService` (for worktree path resolution). Reads `projectId` + `branch` from route params. Renders preview iframe/webview. No props.

### 5. `src/modules/explorer/ExplorerPage.vue` — REPLACE stub

Owns the file tree and editor. Calls `useAppContext()` to get `gitService`. Reads `projectId`, `branch`, and optional `filename` param from route. Renders file search + editor pane. No props.

### 6. `src/app-context/type.ts` — Extend if needed

If any module page needs a service not yet on `AppContext` (e.g. a `ptyService` for the agent terminal), add it here and wire it in `AppContext.vue`.

---

## Data Flow Per Module

Each page follows this pattern:

```
route.params → resolve projectId / branch / threadId / filename
useAppContext() → gitService, threadManagementService
useWorkspaceStore() → projects, worktrees, threads (reactive workspace state)
useActiveWorkspace() → activeWorktree, activeThreadId (computed shortcuts)
```

No cross-panel communication via props or provide/inject from a parent layout. If two panels need shared reactive state (e.g., which file is open), use a Pinia store.

---

## What Gets Deleted

- `src/layouts/WorkspaceLayout.vue` — deleted after all module pages are functional and routing is validated.
- References to `WorkspaceLayout` in `src/router/index.ts`.
- The `AgentPage.vue` that was previously deleted (`D src/modules/agent/AgentPage.vue` in git status) is replaced with the new `AgentPage.vue` written from scratch.

---

## Migration Sequence

1. **Router** — Add `ThreadLayout` route entry with all child panel routes. Keep `WorkspaceLayout` wired in parallel during transition so nothing breaks.
2. **ThreadLayout.vue** — Create the thin layout shell with tab pills and `<RouterView />`.
3. **AgentPage.vue** — Implement agent terminal panel via `useAppContext()`.
4. **GitPage.vue** — Implement git diff panel via `useAppContext()`.
5. **BrowserPage.vue** — Implement preview panel via `useAppContext()`.
6. **ExplorerPage.vue** — Implement file explorer panel via `useAppContext()`.
7. **Smoke test** — Verify each route renders correctly, tab navigation works, no WorkspaceLayout references remain.
8. **Delete WorkspaceLayout.vue** — Remove file and all imports.

---

## Constraints

- **Do not reuse WorkspaceLayout internals** — each module page is written fresh.
- **No prop drilling from Layout.vue or ThreadLayout.vue** — all data comes from `useAppContext()`, `useWorkspaceStore()`, and route params.
- `Layout.vue` is not modified (it already renders `<RouterView />` inside `<SidebarInset>`).
- `AppContext.vue` / `type.ts` may be extended but not restructured.
