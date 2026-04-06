# Workspace launcher (Raycast-style) — Fuse.js thread & file search

**Date:** 2026-04-07  
**Status:** Approved in chat; pending written spec review before implementation plan

## Problem

Users need a single fast entry point to jump to **threads** or **files** within the **current workspace**, with **fuzzy ranking** (not only substring match). File search must support two scopes: the **primary checkout** (current branch tree) and **linked worktrees**, without mixing them unless the user opts in via a **query prefix**.

## Goals

- Raycast-like **modal launcher**: filter input, keyboard navigation (↑↓, Enter, Esc), activatable results.
- **Workspace scope only:** the active project / workspace context (not every open project in the session).
- **Thread search:** fuzzy match on thread fields available in the workspace snapshot (minimum: **title**; optional later: agent type as a secondary key).
- **File search (default):** fuzzy match on paths under the **primary worktree / checkout** for the active workspace, using the same ignore rules as the existing Files tab (`node_modules`, `.git`, `dist`, `dist-electron`, etc.).
- **File search (worktrees):** when the user prefixes the query with **`@wt`** (see Prefix rules), fuzzy match only on files under **linked worktree roots**, with each result labeled so the correct worktree is obvious.
- Use **Fuse.js** for indexing and scoring in the renderer (see Architecture).
- Coexist with the existing **Files tab** and **⌘⇧F / Ctrl+Shift+F** “focus file search” behavior: the launcher is a **global quick open**, not a replacement for the tabbed editor workflow.

## Non-goals

- Cross-project or “all workspaces in the window” search.
- Full command palette (settings, arbitrary actions) in v1.
- Content / full-text search inside files.
- Replacing `FileSearchEditor` substring v1 behavior inside the Files tab (that can adopt Fuse later as a separate change).
- Binary files or opening non-text assets from the launcher.
- Persisted on-disk search indexes across app restarts.

## User experience

### Opening and closing

- New shortcut: **⌘K** on macOS, **Ctrl+K** elsewhere (Mod+`KeyK`), registered in `keybindings/registry.ts` and wired through `useWorkspaceKeybindings` with the same focus guards as other workspace shortcuts (respect settings modal, typing surfaces, integrated terminal where applicable).
- **Esc** closes the launcher and restores prior focus.
- **Enter** activates the highlighted result.

### Results presentation

- **Default mode:** show **threads** and **branch files** in one list, visually grouped or sectioned (e.g. “Threads” / “Files”) so scanability matches Raycast-style palettes.
- **`@wt` mode:** show **worktree files only** (no thread rows), grouped or labeled by worktree name or path suffix.

### Activation

- **Thread:** set active thread (same semantics as selecting a thread in the sidebar).
- **File (branch):** open the file in the existing Files flow (e.g. switch to Files tab, select worktree if needed, open path)—exact wiring should mirror current `FileSearchEditor` / layout behavior so paths stay consistent.
- **File (worktree):** activate the **target worktree** if necessary, then open the file under that root (IPC must remain root-scoped per worktree).

## Prefix rules

- **Canonical token:** `@wt` at the **start** of the query (case-sensitive to avoid accidental triggers; document in UI hint).
- **Parsing:** strip `@wt` and any single following space from the query string before passing the remainder to Fuse for the worktree file index. If the user types only `@wt` or `@wt ` with no remainder, show an instructional empty state (“Type to search files across worktrees”).
- **Default:** no token → search **threads + primary checkout files** as described above.
- **Threads in `@wt` mode:** **excluded** so the token consistently means “worktree file search only.”

## Search and indexing (Fuse.js)

- **Library:** add `fuse.js` as a dependency; configure sensible defaults (e.g. `keys` on `title` for threads, `relativePath` / path segments for files) with thresholds tuned in implementation so short queries still feel responsive.
- **Logical indexes:**
  - `threads`: built from the current workspace snapshot for the active project/worktree context.
  - `branchFiles`: built from the file listing API used today for the **primary** checkout (same ignore rules as `FileSearchEditor`).
  - `worktreeFiles`: built from file listings for **each linked worktree root**, with each record carrying `worktreeId` or display label for UI.
- **Query path:** parse prefix → run Fuse on the appropriate index(es); **default mode** may run two Fuse searches (threads + branch files) and **merge/rank** for display (implementation may use normalized scores or fixed section ordering with independent top-N per section—choose one approach in the implementation plan and keep UX predictable).
- **Refresh triggers:** rebuild or refresh indexes when the workspace snapshot changes, when the worktree list changes, and when opening the launcher or after debounced file-tree refresh if the app already has hooks (avoid full walks on every keystroke).

## Architecture

**Chosen approach:** **renderer-side Fuse** (Approach 1 from design discussion), reusing existing IPC for file listing and thread data.

```text
WorkspaceLayout (or dedicated host)
  -> WorkspaceLauncherModal (v1 component)
       -> parseQuery() -> scope: default | @wt
       -> fuseThreads, fuseBranchFiles, fuseWorktreeFiles (rebuilt per triggers)
       -> workspaceApi.* for listFiles / snapshot (existing patterns)

preload / main
  -> unchanged security model: paths resolved under declared roots only
```

**Alternatives considered:** main-process indexer (heavier IPC); lazy first-query-only indexes (fallback if open latency or repo size demands it).

## Security and path handling

- All file operations go through existing **root-scoped** IPC; the launcher never receives arbitrary absolute paths from the renderer for execution.
- Worktree results must include only paths under the **declared worktree root** for that entry.

## Error handling and empty states

- No active workspace / no worktree: show a clear inactive state; do not crash.
- IPC or listing failure: show a non-blocking error or empty state with retry on next open.
- No matches: standard “No results” copy.

## Testing

- **Unit:** prefix parser (`@wt` stripping, edge cases); optional small Fuse fixture for ranking smoke tests.
- **Component:** modal open/close, arrow keys, Enter activation emits correct payloads (mock workspace API).
- **Regression:** existing `FileSearchEditor` and keybinding tests remain green; new shortcut does not conflict (⌘K / Ctrl+K is unused in `KEYBINDING_DEFINITIONS` as of this spec).

## Open decisions for implementation plan only

- Exact Fuse `keys` / `threshold` values (tune against real repos).
- Merge strategy for default mode (interleaved vs sectioned top-N).
- Whether to show a one-line hint under the input (`@wt` — search worktrees).
