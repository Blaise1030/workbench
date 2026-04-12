# Queue TipTap Comment Editor — Design Spec

**Date:** 2026-04-12
**Branch:** feat/thread-activity-notification

## Overview

Replace the plain `Textarea` in the `PromptWithFileAttachments` "Comment for the agent" section of the context queue review popup with a full TipTap editor — same capabilities as the thread-create popup (`@` file mentions, `/` slash commands, inline image badge nodes). The editor toggles between an **edit mode** and a **blob mode** (compact read-only preview), with an explicit "Done" button to commit.

## Scope

| File | Change |
|---|---|
| `apps/desktop/src/components/PromptWithFileAttachments.vue` | Add `tiptap` + `worktreePath` props; TipTap editor + blob toggle |
| `apps/desktop/src/components/contextQueue/ContextQueueReviewDropdown.vue` | Add `worktreePath` prop; pass `:tiptap="true"` to `PromptWithFileAttachments` |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Compute active worktree path; pass to dropdown |

No changes to `QueueItem` type, `buildItemForSend`, or any other files.

## Data Model

`QueueItem.reviewComment` (string) and `QueueItem.reviewAttachments` (`LocalFileAttachment[]`) are unchanged. The TipTap doc is **ephemeral** — it lives in component state only. On "Done", the component serializes back to these existing fields.

No new IPC, no schema changes.

## Props

### `PromptWithFileAttachments`

Two new **optional** props (defaults preserve existing behavior):

```ts
tiptap?: boolean          // default: false — enables TipTap mode
worktreePath?: string | null  // passed to createThreadCreatePromptExtensions
```

When `tiptap=false` (default): zero change to existing consumers.

### `ContextQueueReviewDropdown`

One new optional prop:

```ts
worktreePath?: string | null
```

Forwarded to `PromptWithFileAttachments`.

### `WorkspaceLayout`

Compute active worktree path (no new IPC needed — data is already in store):

```ts
const activeWorktreePath = computed(
  () => workspace.worktrees.find(w => w.id === workspace.activeWorktreeId)?.path ?? null
)
```

Pass as `:worktree-path="activeWorktreePath"` to `ContextQueueReviewDropdown`.

## TipTap Editor Setup

When `tiptap=true`, create a TipTap editor via `useEditor` with:

- `StarterKit` — minimal config (paragraphs + lists; no headings)
- `Placeholder` — using the existing `placeholder` prop value
- `ThreadImageBadge` — inline image attachment nodes
- `createThreadCreatePromptExtensions({ getWorktreePath: () => props.worktreePath })` — `@` file mentions + `/` slash commands

Same extensions as `ThreadCreateButton`. Reuse existing imports from `threadCreateEditorExtensions.ts`.

## Edit / Blob Toggle

Internal state:

```ts
const isEditing = ref(true)  // starts in edit mode
```

### Edit mode

- `EditorContent` styled to match current textarea: `border border-input bg-background rounded-md px-2.5 py-1.5 text-[13px] min-h-[3.25rem]`
- Below editor: row with **paperclip button** (left) + **"Done" button** (right, `variant="ghost"` `size="sm"`)
- Paperclip opens file picker; non-image files inserted as `threadMention` nodes, images as `threadImageBadge` nodes (same as `ThreadCreateButton`)
- Drag-and-drop onto editor (images → inline nodes; other files → mention nodes)

### Blob mode (after Done)

- `editor.setEditable(false)`
- Wrap `EditorContent` in a `<button>` with `bg-muted/30 rounded-md px-2 py-1` — no border, compact
- Inline text and file chip nodes render naturally via existing TipTap CSS (same visual as image 2)
- **Empty state:** if doc is empty and `isEditing=false`, render nothing — no blob shown
- Click blob → `isEditing = true`, `editor.setEditable(true)`, `nextTick(() => editor.commands.focus('end'))`

Toggle is driven by a `watch(isEditing, (v) => editor.setEditable(v))` — no editor destroy/recreate.

## "Done" Button Behavior

```ts
function onDone() {
  // 1. Serialize text
  emit('update:prompt', promptDocFlatText(editor.state.doc))

  // 2. Extract inline file attachments
  const { filePaths } = collectDocAttachmentPaths(editor.state.doc)
  const attachments: LocalFileAttachment[] = filePaths.map(p => ({
    id: p,
    path: p,
    name: basename(p),
    isImage: isImageFile({ name: basename(p) })
  }))
  emit('update:attachments', attachments)

  // 3. Collapse to blob
  isEditing.value = false
}
```

## Reset on Dropdown Reopen

`ContextQueueReviewDropdown` calls `cloneItems` on open, which resets `reviewComment` to `""`. In `PromptWithFileAttachments` (tiptap mode), watch the `prompt` prop:

```ts
watch(() => props.prompt, (v) => {
  if (tiptap && v === '') {
    editor.commands.clearContent()
    isEditing.value = true
  }
})
```

This ensures each dropdown open starts fresh with an empty editor in edit mode.

## What Does Not Change

- `buildItemForSend` in `ContextQueueReviewDropdown` — unchanged; still concatenates `reviewComment` text + `[Attached files]` block from `reviewAttachments`
- `QueueItem` type — no new fields
- All existing consumers of `PromptWithFileAttachments` — unaffected (no `tiptap` prop = old behavior)
- Tests for `ContextQueueReviewDropdown` — no new test cases required for existing behavior
