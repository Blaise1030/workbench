# Thread System Design

**Date:** 2026-04-05

## Overview

Implement a fully functional thread system: compact thread rows with agent icons, an agent grid picker to create threads, and the ability to rename/delete threads with automatic PTY session cleanup.

---

## Components

### AgentIcon.vue (new — `src/components/ui/AgentIcon.vue`)

A single component rendering the real brand SVG for each `ThreadAgent`. Accepts:
- `agent: ThreadAgent` — determines which SVG to render
- `size?: number` — pixel size (default 14)

SVG sources (all from Simple Icons):
- `claude` → Anthropic logo
- `codex` → OpenAI logo
- `cursor` → Cursor logo
- `gemini` → Google Gemini logo

SVG `fill` inherits `currentColor` so icon colour follows the text context.

---

### ThreadRow.vue (new — `src/components/ThreadRow.vue`)

A compact single-line thread row.

**Props:**
```ts
thread: Thread
isActive: boolean
```

**Emits:**
```ts
select: []
remove: []
rename: [newTitle: string]
```

**Layout:** `[AgentIcon 14px] [truncated title flex-1] [ChevronDown on hover]`

**Behaviour:**
- Hover reveals a `ChevronDown` icon button right-aligned.
- Clicking the chevron opens a small popover (same pattern as the existing `+` menu: `ref` + `pointerdown` outside-click dismiss + `Escape` dismiss).
- Popover contains two items: **Rename** and **Delete**.
- Clicking **Delete** emits `remove`.
- Clicking **Rename** closes the popover and enters inline edit mode: the title text is replaced by a focused `<input>` pre-filled with the current title. Enter confirms (emits `rename`), Escape cancels. Empty input on Enter does nothing (keeps existing title).
- Component manages its own `isHovered`, `menuOpen`, `isEditing` state locally.

---

### ThreadSidebar.vue (modified — `src/components/ThreadSidebar.vue`)

**New emits added:**
```ts
remove: [threadId: string]
rename: [threadId: string, newTitle: string]
```

**Thread list change:** Replace the current `<li>` + `<BaseButton>` loop with `<ThreadRow>` components. Forward `@remove` and `@rename` events upward.

**Agent picker change:** Replace the vertical `role="menu"` list with a single-row grid of 4 buttons. The popover becomes wider (`min-w-[18rem]`). Each button shows:
- `AgentIcon` at 20px centred above
- Agent label below in small text

Layout: `grid grid-cols-4 gap-1 p-2`

---

### WorkspaceLayout.vue (modified — `src/layouts/WorkspaceLayout.vue`)

**New handlers:**

```ts
async function handleRemoveThread(threadId: string): Promise<void>
```
1. Call `api.terminalPtyKill(threadId)` to clean up the PTY session.
2. Call `api.deleteThread(threadId)`.
3. If `workspace.activeThreadId === threadId`, set active thread to the first remaining thread in `workspace.activeThreads` (excluding the deleted one), or `null` if none remain.
4. Call `refreshSnapshot()`.

```ts
async function handleRenameThread(threadId: string, newTitle: string): Promise<void>
```
1. Call `api.renameThread(threadId, newTitle)`.
2. Call `refreshSnapshot()`.

Wire these to `@remove` and `@rename` on `<ThreadSidebar>`.

---

## IPC Layer

### `src/shared/ipc.ts`

Add to `IPC_CHANNELS`:
```ts
workspaceDeleteThread: "workspace:deleteThread",
workspaceRenameThread: "workspace:renameThread",
```

Add interfaces:
```ts
export interface DeleteThreadInput {
  threadId: string;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}
```

---

## Electron Backend

### `electron/services/workspaceService.ts`

Add two methods:

**`deleteThread(threadId: string): void`**
- Delete the thread row from SQLite by `id`.

**`renameThread(threadId: string, title: string): Thread`**
- Update the thread's `title` and `updatedAt` in SQLite.
- Return the updated thread.

### `electron/main.ts`

Register two new IPC handlers:

```ts
ipcMain.handle(IPC_CHANNELS.workspaceDeleteThread, (_, input: DeleteThreadInput) => {
  workspaceService.deleteThread(input.threadId);
});

ipcMain.handle(IPC_CHANNELS.workspaceRenameThread, (_, input: RenameThreadInput) => {
  return workspaceService.renameThread(input.threadId, input.title);
});
```

### `electron/preload.ts`

Expose `deleteThread` and `renameThread` on the `api` object so the renderer can call them.

---

## PTY Session Cleanup

`api.terminalPtyKill(threadId)` is called before the DB delete, using the existing `terminal:ptyKill` IPC channel. The PTY manager uses `threadId` as the session key (matching how `TerminalPane` creates sessions via `terminal:ptyCreate`). The kill handler must tolerate a missing session — no-op if the session does not exist.

---

## Data Flow: Delete Thread

```
User clicks Delete
  → ThreadRow emits remove
  → ThreadSidebar emits remove(threadId)
  → WorkspaceLayout.handleRemoveThread(threadId)
      → api.terminalPtyKill(threadId)
      → api.deleteThread({ threadId })
      → if was active: api.setActiveThread(nextThreadId | null)
      → refreshSnapshot()
  → UI updates
```

## Data Flow: Rename Thread

```
User confirms inline rename
  → ThreadRow emits rename(newTitle)
  → ThreadSidebar emits rename(threadId, newTitle)
  → WorkspaceLayout.handleRenameThread(threadId, newTitle)
      → api.renameThread({ threadId, title: newTitle })
      → refreshSnapshot()
  → UI updates
```

---

## Out of Scope

- Undo/redo for delete
- Thread reordering
- Multi-select delete
- Confirmation dialog before delete
