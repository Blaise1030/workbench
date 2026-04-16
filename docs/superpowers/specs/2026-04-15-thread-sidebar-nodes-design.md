# Thread Sidebar Nodes — Design Spec

**Date:** 2026-04-15  
**Branch:** local-commit-message-model

## Overview

Refactor the thread sidebar to reuse the `FileTreeNode` pattern. Each context (worktree) is rendered as a directory node; each thread is rendered as a file node. This replaces the current `ThreadGroupHeader` + `ThreadRow` loop in `ThreadSidebar.vue` with a unified `ThreadSidebarNodes.vue` component.

---

## Data Types

Defined and exported from `ThreadSidebarNodes.vue`:

```ts
export type ThreadSidebarNodeData =
  | {
      kind: "context";
      id: string;           // uiKey (worktreeId or fallback key)
      title: string;
      isWorktree: boolean;  // true = non-primary worktree → shows Delete in context menu
      isPrimary: boolean;
      isStale: boolean;
      branch: string | null;
      threads: ThreadSidebarNodeData[];
    }
  | {
      kind: "thread";
      thread: Thread;
      isActive: boolean;
      runStatus: RunStatus | null;
      needsIdleAttention: boolean;
      hideAgentIcon: boolean;
    };
```

---

## `ThreadSidebarNodes.vue` Component

### Props

| Prop | Type | Description |
|---|---|---|
| `node` | `ThreadSidebarNodeData` | The node to render |
| `expandedContexts` | `Set<string>` | Set of context IDs currently expanded |
| `collapsed` | `boolean` | Sidebar rail mode (icons only) |

### Emits

| Event | Payload | Trigger |
|---|---|---|
| `toggleContext` | `id: string` | Chevron or row click on context |
| `addThread` | `contextId: string` | `+` button on context row |
| `deleteContext` | `id: string` | Context menu "Delete context" (worktrees only) |
| `selectThread` | `threadId: string` | Thread row click |
| `removeThread` | `threadId: string` | Thread archive action |
| `renameThread` | `threadId: string, newTitle: string` | Thread inline rename |

### Rendering: `kind: "context"` (folder)

- Row: `▸/▾` chevron + title + inline `+` button (always visible)
- Title gets destructive colour when `isStale === true`
- `ContextMenu` wraps the row; "Delete context" item shown only when `isWorktree === true`
- Children: nested `<ul>` with `<ThreadSidebarNodes>` per thread, same bubble-up emit pattern as `FileTreeNode`

### Rendering: `kind: "thread"` (file)

- Embeds the existing `ThreadRow` component directly — no behaviour change
- No separate context menu needed (ThreadRow handles its own archive action)

---

## `ThreadSidebar.vue` Changes

### New computed: `sidebarNodes`

Replaces the `branchFilteredContextGroups` loop in the template:

```ts
const sidebarNodes = computed<ThreadSidebarNodeData[]>(() =>
  branchFilteredContextGroups.value.map((group) => ({
    kind: "context",
    id: group.uiKey,
    title: group.title,
    isWorktree: !group.isPrimary && group.worktreeId !== null,
    isPrimary: group.isPrimary,
    isStale: group.isStale,
    branch: group.branch,
    threads: displayThreadsForGroup(group).map((thread) => ({
      kind: "thread",
      thread,
      isActive: thread.id === props.activeThreadId,
      runStatus: props.runStatusByThreadId?.[thread.id] ?? null,
      needsIdleAttention: Boolean(props.idleAttentionByThreadId?.[thread.id]),
      hideAgentIcon: thread.id === props.inlinePromptThreadId,
    })),
  }))
);
```

### Template replacement

```html
<ThreadSidebarNodes
  v-for="node in sidebarNodes"
  :key="node.id"
  :node="node"
  :expanded-contexts="expandedContexts"
  :collapsed="collapsed"
  @toggle-context="toggleGroup"
  @add-thread="emit('addThreadInline', $event)"
  @delete-context="emit('deleteWorktreeGroup', $event)"
  @select-thread="emit('select', $event)"
  @remove-thread="emit('remove', $event)"
  @rename-thread="(id, title) => emit('rename', id, title)"
/>
```

`expandedContexts` is the inverse of `effectiveCollapsedGroups` — a `Set<string>` of context IDs that are *not* collapsed.

### Removals

- `ThreadGroupHeader` import and all usage
- `WorktreeStaleCallout` block (stale state expressed via context row styling)
- Show more / show less `<Button>` blocks in the expanded template (pagination logic moves into the node component or stays as a helper emitted from the node)

### Preserved

- Collapsed rail popover logic (`Popover` / `PopoverContent`) wraps context nodes when `collapsed === true`
- Branch filter toggle (`filterByCurrentBranch` switch)
- Footer (`BranchPicker` + Add worktree button)
- All existing emits and props on `ThreadSidebar`

---

## What Does NOT Change

- `ThreadRow.vue` — unchanged, embedded as-is
- `FileTreeNode.vue` — unchanged
- All stores, domain types, and IPC — unchanged
- Collapsed popover behaviour — preserved exactly
