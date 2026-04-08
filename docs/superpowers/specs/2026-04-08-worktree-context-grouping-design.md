# Worktree Context Grouping — Design Spec

## Summary

The desktop workspace should treat the primary checkout and linked git worktrees as one unified set of execution contexts. Every thread belongs to exactly one context. Selecting a thread switches the entire shell to that thread's context so Agent, Git Diff, Files, and newly created terminals all operate on the same checkout.

The primary checkout is the default context for the branch lane the user is working in. Linked worktrees are sibling contexts under that same project. In the UI, threads are grouped by context instead of flattened or partially mixed.

## Problem

The current behavior leaves too much room for ambiguity:

- users can select a thread while Files or other panels appear rooted elsewhere
- the app mixes `active worktree` and `active thread's worktree` semantics
- the special case of "threads not in any worktree" creates a second mental model
- cross-context navigation is not visually obvious enough

This is especially confusing when the user is working on a feature branch with multiple linked worktrees such as:

- primary checkout: `feature/implement-authentication`
- linked worktree: `implement-google`
- linked worktree: `implement-facebook`

In that setup, selecting a thread under `implement-google` must make the whole shell operate inside `implement-google`, while selecting a thread attached to the primary checkout must restore the primary checkout context.

## Goals

- Make execution context unambiguous at all times.
- Treat the primary checkout as the default worktree-like context, not as an "outside mode."
- Ensure thread selection always resolves the shell to exactly one context.
- Group threads by context in the sidebar for discoverability.
- Show clear context labeling in the main workspace chrome.
- Prevent mixed-context behavior across Agent, Git Diff, Files, and terminals.

## Non-goals

- Cross-context threads.
- Cross-branch thread groups spanning unrelated worktrees.
- Multi-context Files or Diff views.
- Arbitrary nesting of worktree groups.
- Reworking the git worktree creation flow in this change.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Primary checkout model | Treat as the default context under the current project |
| Thread ownership | Every thread belongs to exactly one context |
| Context switching | Selecting a thread auto-switches the entire shell to that thread's context |
| Sidebar layout | Group threads by context; active group expanded, others collapsed by default |
| Main context badge | Show visible context badge in Agent tab and thread header |
| Files scoping | Files always bind to the active context only |
| "Outside mode" | Remove as a product concept; replace with `Primary` context |

## User Model

Users should be able to think about the workspace like this:

- a project has one `Primary` lane
- the project may also have linked worktree lanes
- each lane has its own threads
- when a lane is active, all execution surfaces follow it

Example:

- `Primary` → checkout for `feature/implement-authentication`
- `implement-google` → linked worktree lane
- `implement-facebook` → linked worktree lane

If the user clicks a thread in `implement-google`, the app switches to `implement-google` and all execution surfaces follow that lane. If they click a thread in `Primary`, the app returns to the main checkout lane.

## Domain Model

The existing `Worktree` model should become the single concept for checkout context. The primary checkout should be represented as a normal worktree row flagged as the default context.

```ts
export interface Worktree {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  isActive: boolean;
  isDefault: boolean;
  baseBranch: string | null;
  lastActiveThreadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  projectId: string;
  worktreeId: string;
  title: string;
  agent: ThreadAgent;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

Product interpretation:

- a thread on the primary checkout is not "ungrouped"
- it is attached to the default worktree for that project

That removes the need for a separate "outside mode" in state, UI, and logic.

## Context Resolution Rules

There must be exactly one active execution context at a time.

### Selecting a thread

When the user selects a thread:

1. read the thread's `worktreeId`
2. activate that worktree if it is not already active
3. set the selected thread active
4. re-scope all context-bound panels to that worktree

After selection:

- Agent terminal uses the thread's worktree
- Git Diff uses the active worktree
- Files uses the active worktree
- any new integrated terminal starts in the active worktree path

### Switching contexts manually

When the user switches worktree manually:

1. activate that worktree
2. restore that worktree's `lastActiveThreadId` when present
3. otherwise select the first thread in that worktree, if any
4. otherwise leave no active thread selected in that context

### Opening files from launcher or other entry points

When the user opens a file from launcher, diff review, or other jump surfaces:

1. resolve the target worktree
2. activate that worktree
3. open the file in the Files panel

No flow should open a file while leaving a different worktree marked active.

## Sidebar Design

The thread sidebar should render grouped contexts instead of a single mixed list.

### Group structure

For each project, render thread groups in this order:

1. `Primary`
2. linked worktrees in stable order

Each group header shows:

- context name
- branch label
- active state
- stale or missing-worktree status when relevant

### Expansion behavior

- active context group expanded by default
- non-active groups collapsed by default
- per-group collapsed state can be persisted locally

### Row behavior

Clicking a thread in any group:

1. switches active context to that group's worktree
2. marks the thread active
3. updates the rest of the shell

This makes sidebar selection the canonical entry point for context switching.

## Main Workspace Chrome

The active context should be obvious without opening the sidebar.

### Agent tab badge

Add a badge in front of or beside the Agent tab label showing the active context:

- `Primary`
- `implement-google`
- `implement-facebook`

### Thread header badge

Show the same badge in the active thread header so the user can always confirm where they are before interacting with the agent.

### Files and Diff labeling

Files and Git Diff should reuse the same active context label in their header rows where practical, so every editing or review surface reinforces the same context.

## Files Panel Rules

The Files panel must bind strictly to the active worktree context.

Required behavior:

- do not derive Files scope from "active thread if present, otherwise active worktree"
- do not silently display files from a non-active context
- changing active thread across groups must switch active worktree first

This removes the current ambiguity where the visible active worktree and the file root can diverge.

## Terminal Rules

Integrated terminals are context-scoped.

- new terminals spawn in the active worktree path
- restored terminals remain keyed by worktree id
- switching active context shows that context's terminal sessions

This keeps terminal behavior aligned with Agent, Files, and Git Diff.

## Error Handling

- If a thread points to a missing worktree, show a clear stale-context state and block context-bound actions that require a path.
- If a user tries to switch context with unsaved file edits, the app must confirm before switching.
- If context switching is cancelled, no panel may partially switch to the new context.
- If no threads exist in a context, the shell still activates that context cleanly and shows the empty-thread state.

## Migration Notes

- Existing threads attached to the default worktree become `Primary` threads in the UI.
- Any renderer logic still treating the default checkout as separate from worktrees should be removed.
- Labels such as "ungrouped" or "outside mode" should be replaced with `Primary`.

## Testing

### Unit

- thread selection resolves the correct worktree id
- manual worktree switching restores that worktree's thread selection
- context grouping orders `Primary` first
- launcher/open-file flows resolve active context before file open

### Component

- sidebar renders grouped contexts with active group expanded
- clicking a thread in another group switches active context
- Agent tab badge updates when active context changes
- Files panel re-roots to the new active context after thread selection

### Regression

- dirty file confirmation blocks context switch cleanly
- cancelling a context switch keeps active worktree, selected file, and save target aligned
- no surface shows a different worktree than the active context badge

## Phased Implementation Plan

### Phase 1: normalize context semantics

- remove product language around "outside mode"
- treat the default worktree as `Primary`
- make thread selection activate thread context first

### Phase 2: align shell surfaces

- bind Files strictly to active context
- ensure Git Diff and new terminals follow active context
- add active context badge to Agent tab and thread header

### Phase 3: grouped sidebar

- group threads by context in the sidebar
- persist collapse state locally
- expand the active context by default

### Phase 4: verification and cleanup

- add regression coverage for cross-context selection
- remove old mixed-context fallback logic
- verify labels and terminology are consistent across the app

## Out of Scope

- redesigning worktree creation UI
- moving threads between contexts
- cross-project context grouping
- advanced branch graph visualization
