# Queue TipTap Comment Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain textarea in the context queue review popup's "Comment for the agent" field with a TipTap editor (same capabilities as the thread-create popup) that toggles between an edit mode and a compact blob preview.

**Architecture:** Extend `PromptWithFileAttachments.vue` with two new optional props (`tiptap`, `worktreePath`). When `tiptap=true`, the component renders a TipTap editor (with `@` file mentions, `/` slash commands, inline image nodes) in edit mode, or a read-only blob view after "Done" is clicked. Wire the prop in `ContextQueueReviewDropdown` and thread `worktreePath` down from `WorkspaceLayout`.

**Tech Stack:** Vue 3 Composition API, TipTap v3 (`@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`), existing `threadCreateEditorExtensions.ts` extensions, existing `threadCreateTipTap.ts` + `threadCreatePromptSerialize.ts` serializers.

---

## File Map

| File | Change |
|---|---|
| `apps/desktop/src/components/PromptWithFileAttachments.vue` | Add `tiptap` + `worktreePath` props; TipTap editor instance; edit/blob toggle; Done logic |
| `apps/desktop/src/components/contextQueue/ContextQueueReviewDropdown.vue` | Add `worktreePath` prop; pass `:tiptap="true"` + `:worktree-path` + `:key` reset |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Add `activeWorktreePath` computed; pass to dropdown |

No new files. No changes to `QueueItem` type, `buildItemForSend`, or any other file.

---

## Task 1: Add TipTap editor instance + state to `PromptWithFileAttachments.vue`

**Files:**
- Modify: `apps/desktop/src/components/PromptWithFileAttachments.vue`

- [ ] **Step 1: Read the current file**

Open `apps/desktop/src/components/PromptWithFileAttachments.vue` and confirm the current imports and props.

- [ ] **Step 2: Add new imports to the `<script setup>` block**

Add after the existing imports:

```ts
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { computed, nextTick, watch } from "vue";
import {
  createThreadCreatePromptExtensions,
  ThreadImageBadge
} from "@/lib/threadCreateEditorExtensions";
import { collectDocAttachmentPaths } from "@/lib/threadCreatePromptSerialize";
import { promptDocFlatText } from "@/lib/threadCreateTipTap";
```

> `ref` is already imported. Add `computed`, `nextTick`, `watch` to the existing `vue` import line.

- [ ] **Step 3: Extend the props definition**

Replace the existing `withDefaults(defineProps<{...}>(), {...})` block with:

```ts
const props = withDefaults(
  defineProps<{
    placeholder?: string;
    rows?: number;
    /** Textarea min height class */
    textareaClass?: string;
    testIdPrefix?: string;
    /** When true, renders a TipTap editor with @ mentions and / commands instead of a plain textarea */
    tiptap?: boolean;
    /** Worktree absolute path — required for @ file mention resolution in tiptap mode */
    worktreePath?: string | null;
  }>(),
  {
    placeholder: "",
    rows: 3,
    textareaClass: "min-h-[4.5rem]",
    testIdPrefix: "prompt-attachments",
    tiptap: false,
    worktreePath: null
  }
);
```

- [ ] **Step 4: Create the TipTap editor instance (conditional at setup time)**

Add after the `attachments` model definition:

```ts
// TipTap editor — only instantiated when tiptap=true (prop is static after mount)
const tiptapEditor = props.tiptap
  ? useEditor({
      extensions: [
        StarterKit.configure({ heading: false, codeBlock: false }),
        Placeholder.configure({ placeholder: props.placeholder || "Comment for the agent (optional) — use @ for files" }),
        ThreadImageBadge,
        createThreadCreatePromptExtensions({ getWorktreePath: () => props.worktreePath })
      ],
      content: "<p></p>",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "tiptap min-h-[3.25rem] max-h-[10rem] overflow-y-auto px-2.5 py-1.5 text-[13px] leading-snug text-foreground outline-none focus:outline-none [&_p]:my-0.5",
          role: "textbox",
          "aria-multiline": "true"
        }
      }
    })
  : ref(null);

/** Whether the TipTap editor is in edit mode (vs read-only blob). Starts true. */
const isEditing = ref(true);

const isDocEmpty = computed(() => tiptapEditor.value?.isEmpty ?? true);

// Sync editability with isEditing state
watch(isEditing, (v) => {
  tiptapEditor.value?.setEditable(v);
});
```

- [ ] **Step 5: Add onDone, onBlobClick, and addFilesFromListTipTap functions**

Add before the existing `attachmentEmoji` function:

```ts
function onDone(): void {
  const editor = tiptapEditor.value;
  if (!editor) return;
  // Serialize flat text (inline nodes produce empty string via textBetween)
  prompt.value = promptDocFlatText(editor.state.doc);
  // Extract inline image/mention paths and merge with existing strip attachments
  const { filePaths } = collectDocAttachmentPaths(editor.state.doc);
  const baseName = (p: string) => p.split("/").pop() ?? p;
  const isImagePath = (p: string) =>
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff|ico)$/i.test(baseName(p));
  const inlineAttachments: LocalFileAttachment[] = filePaths.map((p) => ({
    id: p,
    path: p,
    name: baseName(p),
    isImage: isImagePath(p)
  }));
  // Non-image files added via paperclip stay in attachments.value strip
  const stripNonImages = attachments.value.filter((a) => !a.isImage);
  // Deduplicate by path
  const seen = new Set<string>();
  attachments.value = [...inlineAttachments, ...stripNonImages].filter((a) => {
    if (seen.has(a.path)) return false;
    seen.add(a.path);
    return true;
  });
  isEditing.value = false;
}

function onBlobClick(): void {
  isEditing.value = true;
  void nextTick(() => tiptapEditor.value?.commands.focus("end"));
}

function addFilesFromListTipTap(files: FileList | File[]): void {
  const editor = tiptapEditor.value;
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    if (isImageFile(file) && editor) {
      editor
        .chain()
        .focus("end")
        .insertContent([{ type: "threadImageBadge", attrs: { path, name } }])
        .run();
    } else {
      // Non-images go to the attachments strip (same as ThreadCreateButton)
      const next = [...attachments.value];
      if (!next.find((a) => a.path === path)) {
        next.push({ id: crypto.randomUUID(), path, name, isImage: false });
      }
      attachments.value = next;
    }
  }
}
```

- [ ] **Step 6: Override addFilesFromList to route through tiptap handler when in tiptap mode**

Modify the existing `addFilesFromList` function body:

```ts
function addFilesFromList(files: FileList | File[]): void {
  if (props.tiptap) {
    addFilesFromListTipTap(files);
    return;
  }
  const next: LocalFileAttachment[] = [...attachments.value];
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    const isImage = isImageFile(file);
    next.push({
      id: crypto.randomUUID(),
      path,
      name,
      isImage
    });
  }
  attachments.value = next;
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/PromptWithFileAttachments.vue
git commit -m "feat(queue): add TipTap editor instance and state to PromptWithFileAttachments"
```

---

## Task 2: Add TipTap mode template to `PromptWithFileAttachments.vue`

**Files:**
- Modify: `apps/desktop/src/components/PromptWithFileAttachments.vue`

- [ ] **Step 1: Wrap existing template in a `v-if="!tiptap"` guard**

The current `<template>` root is:
```html
<template>
  <div @dragover="onDragOver" @drop="onDrop">
    <Textarea .../>
    ...
  </div>
</template>
```

Restructure the template so the existing content is gated and a new TipTap branch is added.

> **Important:** `EditorContent` renders a block-level `<div>` and can only be mounted to one DOM node per editor instance. The TipTap branch uses a **single** `EditorContent` at all times — its wrapper div toggles classes to switch between edit-mode and blob-mode appearance. Never render two `EditorContent` for the same editor.

```html
<template>
  <!-- ── Existing plain-textarea mode ───────────────────────────── -->
  <div v-if="!tiptap" @dragover="onDragOver" @drop="onDrop">
    <Textarea
      v-model="prompt"
      :data-testid="`${testIdPrefix}-textarea`"
      :rows="rows"
      :placeholder="placeholder"
      :class="
        cn(
          'w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 font-sans text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          textareaClass
        )
      "
    />
    <div
      v-if="attachments.length"
      class="mt-1.5 flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
      :data-testid="`${testIdPrefix}-files-strip`"
    >
      <!-- existing attachment chips — keep exactly as they were -->
      <div
        v-for="a in attachments"
        :key="a.id"
        :class="
          cn(
            badgeVariants({ variant: 'secondary' }),
            'inline-flex h-6 max-w-none shrink-0 items-center gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pl-1.5 pr-0.5 text-[11px] shadow-none'
          )
        "
        :title="a.path"
      >
        <span class="shrink-0 text-[12px] leading-none" aria-hidden="true">{{
          attachmentEmoji(a.name, a.isImage)
        }}</span>
        <span class="min-w-0 truncate font-mono text-[10px] font-medium text-foreground">{{
          a.isImage ? a.name : a.path
        }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="size-5 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
          :aria-label="`Remove attached file ${a.path}`"
          @click="removeAttachment(a.id)"
        >
          <X class="size-2.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
    <div class="mt-1 flex items-center gap-1">
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-file-input`"
        @change="onFileInputChange"
      />
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        class="h-7 w-7 shrink-0 rounded-md"
        title="Attach files or images"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-add-file`"
        @click="fileInputRef?.click()"
      >
        <Paperclip class="size-3.5" stroke-width="2" />
      </Button>
    </div>
  </div>

  <!-- ── TipTap mode ─────────────────────────────────────────────── -->
  <div v-else>
    <!-- Hidden file input (shared between edit and blob modes) -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      multiple
      accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
      aria-label="Attach files or images"
      :data-testid="`${testIdPrefix}-file-input`"
      @change="onFileInputChange"
    />

    <!--
      Single EditorContent — always mounted to the same editor instance.
      Wrapper div toggles between edit-border style and blob style via class binding.
      In blob mode the wrapper acts as a clickable region (role="button").
    -->
    <div
      :class="
        isEditing
          ? 'rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'
          : isDocEmpty
            ? 'hidden'
            : 'w-full cursor-text rounded-md bg-muted/30 px-2 py-1 text-[13px] text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      "
      :role="!isEditing && !isDocEmpty ? 'button' : undefined"
      :tabindex="!isEditing && !isDocEmpty ? 0 : undefined"
      :data-testid="!isEditing && !isDocEmpty ? `${testIdPrefix}-tiptap-blob` : undefined"
      :aria-label="!isEditing && !isDocEmpty ? 'Click to edit comment' : undefined"
      @click="!isEditing && !isDocEmpty ? onBlobClick() : undefined"
      @keydown.enter="!isEditing && !isDocEmpty ? onBlobClick() : undefined"
      @keydown.space.prevent="!isEditing && !isDocEmpty ? onBlobClick() : undefined"
    >
      <EditorContent :editor="tiptapEditor" />
    </div>

    <!-- Non-image attachments strip (edit mode only) -->
    <div
      v-if="isEditing && attachments.length"
      class="mt-1.5 flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
      :data-testid="`${testIdPrefix}-files-strip`"
    >
      <div
        v-for="a in attachments"
        :key="a.id"
        :class="
          cn(
            badgeVariants({ variant: 'secondary' }),
            'inline-flex h-6 max-w-none shrink-0 items-center gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pl-1.5 pr-0.5 text-[11px] shadow-none'
          )
        "
        :title="a.path"
      >
        <span class="shrink-0 text-[12px] leading-none" aria-hidden="true">{{
          attachmentEmoji(a.name, a.isImage)
        }}</span>
        <span class="min-w-0 truncate font-mono text-[10px] font-medium text-foreground">{{
          a.isImage ? a.name : a.path
        }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="size-5 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
          :aria-label="`Remove attached file ${a.path}`"
          @click="removeAttachment(a.id)"
        >
          <X class="size-2.5" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <!-- Paperclip + Done row (edit mode only) -->
    <div v-if="isEditing" class="mt-1 flex items-center justify-between gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        class="h-7 w-7 shrink-0 rounded-md"
        title="Attach files or images"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-add-file`"
        @click="fileInputRef?.click()"
      >
        <Paperclip class="size-3.5" stroke-width="2" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
        :data-testid="`${testIdPrefix}-tiptap-done`"
        @click="onDone"
      >
        Done
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Run the dev server and visually verify**

```bash
cd apps/desktop && pnpm dev
```

1. Open a Queue review popup (add something to context queue first)
2. Confirm the "Comment for the agent" field still shows a plain textarea (no `tiptap` prop yet — verify no regression)
3. Stop the dev server

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/PromptWithFileAttachments.vue
git commit -m "feat(queue): add TipTap edit/blob mode template to PromptWithFileAttachments"
```

---

## Task 3: Wire `ContextQueueReviewDropdown` to enable TipTap mode

**Files:**
- Modify: `apps/desktop/src/components/contextQueue/ContextQueueReviewDropdown.vue`

- [ ] **Step 1: Add `worktreePath` prop**

In the `defineProps` block, add:

```ts
const props = defineProps<{
  threadId: string | null;
  items: QueueItem[];
  worktreePath?: string | null;
}>();
```

- [ ] **Step 2: Add a `tiptapResetKey` counter incremented on open**

In the `watch(() => open.value, ...)` block, add one line:

```ts
const tiptapResetKey = ref(0);

watch(
  () => open.value,
  (isOpen) => {
    if (isOpen) {
      internalItems.value = cloneItems(props.items);
      editorExpandedIds.value = new Set();
      tiptapResetKey.value++; // force fresh TipTap editor on each open
    }
  }
);
```

- [ ] **Step 3: Update the `PromptWithFileAttachments` usage in the template**

Find the existing usage:

```html
<PromptWithFileAttachments
  v-model:prompt="row.reviewComment"
  v-model:attachments="row.reviewAttachments"
  :rows="2"
  textarea-class="min-h-[3.25rem] resize-y text-[13px] leading-snug"
  placeholder="Comment for the agent (optional) — images via paperclip"
  test-id-prefix="context-queue-review-note"
/>
```

Replace with:

```html
<PromptWithFileAttachments
  :key="tiptapResetKey"
  v-model:prompt="row.reviewComment"
  v-model:attachments="row.reviewAttachments"
  :tiptap="true"
  :worktree-path="worktreePath"
  placeholder="Comment for the agent (optional) — use @ for files"
  test-id-prefix="context-queue-review-note"
/>
```

> `rows` and `textarea-class` are removed — they only apply to the plain textarea, which is not rendered when `tiptap=true`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/contextQueue/ContextQueueReviewDropdown.vue
git commit -m "feat(queue): pass tiptap=true and worktreePath to PromptWithFileAttachments in review dropdown"
```

---

## Task 4: Thread `worktreePath` through `WorkspaceLayout`

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Add `activeWorktreePath` computed**

Find a block of existing computed properties in the `<script setup>` section (search for `computed(` in the file). Add:

```ts
const activeWorktreePath = computed(
  () =>
    workspace.worktrees.find((w) => w.id === workspace.activeWorktreeId)?.path ?? null
);
```

- [ ] **Step 2: Pass `worktree-path` to `ContextQueueReviewDropdown`**

Find the existing usage (around line 1691):

```html
<ContextQueueReviewDropdown
  v-if="workspace.activeThreadId && contextQueueItems.length > 0"
  ref="contextQueueReviewRef"
  :thread-id="workspace.activeThreadId"
  :items="contextQueueItems"
  @confirm="onContextQueueConfirmed"
/>
```

Add the new prop:

```html
<ContextQueueReviewDropdown
  v-if="workspace.activeThreadId && contextQueueItems.length > 0"
  ref="contextQueueReviewRef"
  :thread-id="workspace.activeThreadId"
  :items="contextQueueItems"
  :worktree-path="activeWorktreePath"
  @confirm="onContextQueueConfirmed"
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "feat(queue): thread activeWorktreePath to ContextQueueReviewDropdown"
```

---

## Task 5: Smoke test the full feature

- [ ] **Step 1: Start the dev server**

```bash
cd apps/desktop && pnpm dev
```

- [ ] **Step 2: Test edit mode**

1. Select some terminal output or a file diff to add something to the context queue
2. Click the **Queue** button in the toolbar
3. Confirm the "Comment for the agent" area shows the TipTap editor (not a plain textarea)
4. Type some text — confirm it renders
5. Type `@` — confirm the file suggestion dropdown appears
6. Select a file — confirm an inline chip appears in the editor
7. Drag an image file onto the editor — confirm it inserts an inline image chip

- [ ] **Step 3: Test Done / blob toggle**

1. Click **Done** — confirm the editor collapses to a compact blob showing the typed text + inline chips
2. Confirm an empty comment shows nothing (no blob rendered)
3. Click the blob — confirm the editor re-opens in edit mode with the cursor at end

- [ ] **Step 4: Test paperclip (non-image)**

1. In edit mode, click the paperclip — select a non-image file (e.g. a `.ts` file)
2. Confirm it appears in the file strip below the editor (not inline)
3. Click Done — confirm the strip item appears in the serialized attachments (check that `buildItemForSend` includes `[Attached files]` with the path)

- [ ] **Step 5: Test dropdown reopen**

1. Type a comment, do NOT click Done
2. Close the queue popup (Cancel)
3. Reopen the queue popup
4. Confirm the comment field is empty and in edit mode (no stale content)

- [ ] **Step 6: Test regression — no plain-textarea consumers broken**

Check the **New Thread** dialog — confirm its own TipTap editor is unaffected. Check any other place `PromptWithFileAttachments` is used (search for `PromptWithFileAttachments` in the codebase) and confirm all non-tiptap usages still show a plain textarea.

- [ ] **Step 7: Final commit**

```bash
git add -p  # stage any last tweaks
git commit -m "feat(queue): TipTap comment editor with blob preview in context queue review"
```
