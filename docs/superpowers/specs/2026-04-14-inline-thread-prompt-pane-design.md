# Inline Thread Prompt Pane

**Date:** 2026-04-14  
**Status:** Approved for implementation

## Overview

Replace the floating "Add thread" modal dialog with an inline compose experience embedded directly in the terminal pane area. When the user clicks any "Add thread" button, a thread is immediately created and the terminal area transitions to a Tiptap rich-text prompt editor. Pressing Enter (or Cmd+Enter) submits the prompt and the editor gives way to the xterm terminal.

---

## Goals

- Remove the modal interruption from thread creation.
- Inline thread creation feels native to the pane — no overlay, no backdrop.
- Enter submits; Cmd+Enter is the global fallback when focus is elsewhere in the pane (agent selector, attach button, etc.).
- Escape cancels and deletes the newly created thread.
- The sidebar "Add thread" (ThreadGroupHeader) and the empty-state button both use the same inline flow.

---

## State Machine

```
[No active thread / empty state]
        │
        │  Click "Add thread"
        ▼
[thread created immediately]  ──→  inlinePromptThreadId = thread.id
        │
        │  [inline Tiptap editor shown in terminal area]
        │
        ├── Enter / Cmd+Enter  ──→  submit prompt → pendingAgentBootstrap set
        │                            inlinePromptThreadId = null
        │                            TerminalPane (xterm) takes over
        │
        └── Escape / Cancel    ──→  delete thread
                                     inlinePromptThreadId = null
                                     return to previous state
```

For the "threads already exist" path (Add thread from sidebar while a thread is active):
1. New thread is created and set as active.
2. The terminal area switches to show the inline prompt editor for the new thread.
3. Submit/cancel behaves identically.

---

## Components

### `ThreadInlinePromptEditor.vue` (new)

Extracted and restyled from the Tiptap section in `ThreadCreateButton.vue`.

**Props:**
```ts
{
  worktreeId: string
  worktreePath: string | null
  defaultAgent?: ThreadAgent
}
```

**Emits:**
```ts
{
  submit: [payload: ThreadCreateWithAgentPayload]
  cancel: []
}
```

**Layout:** Fills the full terminal area (`flex flex-col h-full`).  
- Top area: Tiptap `editor-content` (expands to fill space, same extensions as today: placeholder, @ file mentions, / commands, image badge)  
- Bottom bar: file attachment strip, agent `<Select>`, "Start thread" button  
- Keyboard: Enter submits when no suggestion popover is active; Escape emits `cancel`

**No card/dialog chrome.** No rounded card, no backdrop, no title banner. Background matches `bg-card` so it blends with the surrounding pane.

### `ThreadCreateButton.vue` (existing — keep but slim)

The floating dialog and its Tiptap editor are no longer the primary flow. The component is retained for any remaining callsites (e.g. other parts of the UI that still need the modal), but the Tiptap editor logic that is duplicated will be shared via the new component.

> If no callsites remain after the refactor, `ThreadCreateButton.vue` can be deleted in a follow-up.

---

## WorkspaceLayout changes

### New reactive state

```ts
/** Thread ID that is in "compose prompt" mode — shows inline editor instead of xterm. */
const inlinePromptThreadId = ref<string | null>(null)
```

### "Add thread" click handler (replaces openThreadCreateDialog)

```ts
async function openInlineThreadPrompt(worktreeId: string): Promise<void> {
  const api = getApi()
  if (!api || !workspace.activeProjectId) return
  // Create thread with placeholder title; prompt fills it in on submit.
  const created = await api.createThread({
    projectId: workspace.activeProjectId,
    worktreeId,
    title: 'New thread',
    agent: readPreferredThreadAgent(),
  })
  if (!created?.id) return
  await refreshSnapshot()
  // Mark this thread as "needs a prompt before the terminal starts".
  inlinePromptThreadId.value = created.id
  mainCenterTab.value = 'agent'
}
```

### Template: terminal area

Replace the current `v-if="!activeWorktreeHasThreads"` empty-state block + `v-else TerminalPane` with a three-way branch:

```
activeWorktreeHasThreads === false AND inlinePromptThreadId === null
  → existing empty-state UI (no change)

inlinePromptThreadId !== null AND activeThreadId === inlinePromptThreadId
  → <ThreadInlinePromptEditor>

otherwise
  → <TerminalPane> (unchanged)
```

### Submit handler

```ts
async function onInlinePromptSubmit(payload: ThreadCreateWithAgentPayload): Promise<void> {
  const threadId = inlinePromptThreadId.value
  if (!threadId) return
  // Rename thread title from payload.
  if (payload.prompt.trim()) {
    await api.renameThread({ threadId, title: resolveNewThreadTitle(payload, payload.agent) })
  }
  pendingAgentBootstrap.value = {
    threadId,
    command: bootstrapCommandLineWithPrompt(payload.agent, payload.prompt),
  }
  inlinePromptThreadId.value = null
  await refreshSnapshot()
}
```

### Cancel handler

```ts
async function onInlinePromptCancel(): Promise<void> {
  const threadId = inlinePromptThreadId.value
  if (!threadId) return
  inlinePromptThreadId.value = null
  await handleRemoveThread(threadId)
}
```

---

## Keyboard handling

### Enter (inside Tiptap)

Same logic as today in `ThreadCreateButton`: the Tiptap `keymap` extension intercepts `Enter` and calls `submit()` unless a suggestion (@ / /) popover is active (`isThreadCreateSuggestionActive`).

### Cmd+Enter (global fallback)

When `inlinePromptThreadId` is set, the workspace keydown handler (in `useWorkspaceKeybindings` or directly in `WorkspaceLayout`) intercepts `metaKey + Enter` (Mac) / `ctrlKey + Enter` (Windows/Linux) and triggers `onInlinePromptSubmit` using whatever state is currently in the editor.

The `ThreadInlinePromptEditor` exposes a `submit()` method via `defineExpose` so the parent can call it imperatively.

```ts
// In WorkspaceLayout onKeydown (capture phase):
if (inlinePromptThreadId.value && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
  ev.preventDefault()
  inlinePromptEditorRef.value?.submit()
}
```

### Escape (inside inline editor)

Tiptap keymap extension captures `Escape` and emits `cancel`.

---

## ThreadGroupHeader (sidebar "Add thread" button)

`openAddThreadDialog()` currently calls `openThreadCreateDialog(...)`. Replace with a new event emitted up to `WorkspaceLayout`:

- `ThreadGroupHeader` emits `add-thread-inline: [worktreeId: string]`
- `WorkspaceLayout` handles it by calling `openInlineThreadPrompt(worktreeId)`
- The existing `openThreadCreateDialog` import is removed from `ThreadGroupHeader`

The empty-state "Add thread" button in `WorkspaceLayout` already calls `openAddThreadFromToolbarOrEmpty`, which is updated to call `openInlineThreadPrompt` instead.

---

## Files to create / modify

| File | Change |
|------|--------|
| `components/ThreadInlinePromptEditor.vue` | **New** — extracted Tiptap editor, inline layout |
| `layouts/WorkspaceLayout.vue` | Add `inlinePromptThreadId`, new handlers, template branch, Cmd+Enter intercept |
| `components/ThreadGroupHeader.vue` | Replace `openThreadCreateDialog` call with emitted `add-thread-inline` event |
| `composables/threadCreateDialog.ts` | No change required (kept for any remaining dialog callsites) |
| `components/ThreadCreateButton.vue` | No change for now; evaluate deletion after all callsites audited |

---

## Out of scope

- Persisting an unsaved draft if the user navigates away before submitting (can be a follow-up).
- File drag-and-drop into the inline editor (carry over same handler from `ThreadCreateButton`).
- Skill attachment strip in the inline editor (carry over as-is from `ThreadCreateButton`).
