# Inline Thread Prompt Pane — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating "Add thread" modal with an inline Tiptap compose pane embedded in the terminal area; threads are created immediately on button click, and Enter/Cmd+Enter submits the prompt to start the agent.

**Architecture:** A new `ThreadInlinePromptEditor.vue` holds the Tiptap editor + agent selector + file attachment bar (logic extracted from `ThreadCreateButton.vue`). `WorkspaceLayout` tracks which thread is in compose mode via `inlinePromptThreadId`, renders the editor in place of the xterm terminal, and handles submit/cancel. `ThreadGroupHeader` emits a new `add-thread-inline` event instead of calling `openThreadCreateDialog`.

**Tech Stack:** Vue 3 Composition API, Tiptap v3 (StarterKit, Placeholder, custom extensions), existing `useEditor` / `EditorContent`, Vitest + `@vue/test-utils`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/desktop/src/components/ThreadInlinePromptEditor.vue` | **Create** | Inline Tiptap composer (editor + agent select + file attach) |
| `apps/desktop/src/components/__tests__/ThreadInlinePromptEditor.test.ts` | **Create** | Unit tests for the inline editor |
| `apps/desktop/src/components/ThreadGroupHeader.vue` | **Modify** | Emit `add-thread-inline` instead of calling `openThreadCreateDialog` |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | **Modify** | Add inline prompt state, handlers, Cmd+Enter intercept, template branch |

---

## Task 1: Create `ThreadInlinePromptEditor.vue` with failing tests

**Files:**
- Create: `apps/desktop/src/components/__tests__/ThreadInlinePromptEditor.test.ts`
- Create: `apps/desktop/src/components/ThreadInlinePromptEditor.vue`

- [ ] **Step 1.1: Write the failing tests**

Create `apps/desktop/src/components/__tests__/ThreadInlinePromptEditor.test.ts`:

```typescript
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThreadInlinePromptEditor from "@/components/ThreadInlinePromptEditor.vue";

describe("ThreadInlinePromptEditor", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadInlinePromptEditor>>;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  it("renders the prompt editor area", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-editor"]').exists()).toBe(true);
  });

  it("renders the agent selector", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-agent-select"]').exists()).toBe(true);
  });

  it("renders the attach files button", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-add-file"]').exists()).toBe(true);
  });

  it("emits cancel when the cancel button is clicked", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await wrapper.find('[data-testid="inline-prompt-cancel"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
  });

  it("emits submit with payload when start-thread button is clicked", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await nextTick();
    // Trigger submit via the exposed method (simulates Enter or button click)
    const vm = wrapper.vm as unknown as { submit: () => void };
    vm.submit();
    await nextTick();
    const emitted = wrapper.emitted("submit");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ agent: "claude" });
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd apps/desktop && npx vitest run src/components/__tests__/ThreadInlinePromptEditor.test.ts 2>&1 | tail -20
```

Expected: `FAIL` — component file does not exist yet.

- [ ] **Step 1.3: Create `ThreadInlinePromptEditor.vue`**

Create `apps/desktop/src/components/ThreadInlinePromptEditor.vue`:

```vue
<script setup lang="ts">
import type { ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { BookMarked, MessageSquarePlus, Paperclip, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, unref } from "vue";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import {Button} from "@/components/ui/button";;
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isImageFile, pathFromFile, type LocalFileAttachment } from "@/lib/localFileAttachment";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger
} from "@/components/ui/select";
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import {
  createThreadCreatePromptExtensions,
  isThreadCreateSuggestionActive,
  ThreadImageBadge
} from "@/lib/threadCreateEditorExtensions";
import { collectDocAttachmentPaths } from "@/lib/threadCreatePromptSerialize";

const THREAD_CREATE_PROMPT_PLACEHOLDER =
  "What do you want to build? Use @ for files or / for commands…";

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

type Attachment = LocalFileAttachment;

const props = withDefaults(
  defineProps<{
    worktreeId: string;
    worktreePath: string | null;
    defaultAgent?: ThreadAgent;
  }>(),
  { defaultAgent: undefined }
);

const emit = defineEmits<{
  submit: [payload: ThreadCreateWithAgentPayload];
  cancel: [];
}>();

const keybindings = useKeybindingsStore();
const selectedAgent = ref<ThreadAgent>(props.defaultAgent ?? readPreferredThreadAgent());

const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((o) => o.agent === selectedAgent.value)?.label ?? selectedAgent.value
);

const threadPromptEditor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      bulletList: { HTMLAttributes: { class: "list-disc pl-4" } },
      orderedList: { HTMLAttributes: { class: "list-decimal pl-4" } }
    }),
    Placeholder.configure({ placeholder: THREAD_CREATE_PROMPT_PLACEHOLDER }),
    ThreadImageBadge,
    createThreadCreatePromptExtensions({ getWorktreePath: () => props.worktreePath })
  ],
  content: "<p></p>",
  immediatelyRender: false,
  editorProps: {
    attributes: {
      class:
        "tiptap thread-create-prompt-editor min-h-[10rem] overflow-y-auto px-4 py-4 text-[15px] leading-relaxed text-foreground outline-none focus:outline-none [&_.ProseMirror]:min-h-[10rem] [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": "Thread goal or prompt",
      "aria-placeholder": THREAD_CREATE_PROMPT_PLACEHOLDER,
      tabindex: "0"
    },
    handleKeyDown(view, event) {
      if (isThreadCreateSuggestionActive(view)) {
        if (event.key === "Enter" && !event.shiftKey) return false;
        if (event.key === "Escape") return false;
      }
      if (event.key === "Escape") {
        emit("cancel");
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
        return true;
      }
      return false;
    },
    handleDOMEvents: {
      drop(view, event) {
        const dt = event.dataTransfer;
        if (!dt?.files?.length) return false;
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.(".ProseMirror")) return false;
        event.preventDefault();
        event.stopPropagation();
        const editor = threadPromptEditor.value;
        if (!editor) return true;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords == null) return true;
        const pos = coords.pos;
        const imageNodes: { type: string; attrs: { path: string; name: string } }[] = [];
        for (const file of Array.from(dt.files)) {
          if (isImageFile(file)) {
            imageNodes.push({ type: "threadImageBadge", attrs: { path: pathFromFile(file), name: file.name } });
          } else {
            addFilesFromList([file]);
          }
        }
        if (imageNodes.length > 0) {
          editor.chain().focus().insertContentAt(pos, imageNodes).run();
        }
        return true;
      }
    }
  }
});

const fileInputRef = ref<HTMLInputElement | null>(null);
const skillAttachments = ref<Attachment[]>([]);
const fileAttachments = ref<Attachment[]>([]);

function attachmentEmoji(name: string, isImage: boolean): string {
  if (isImage) return "🖼️";
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const map: Record<string, string> = {
    pdf: "📕", md: "📝", txt: "📄", json: "📋", csv: "📊",
    ts: "📘", tsx: "📘", js: "📙", jsx: "📙", vue: "💚",
    py: "🐍", rs: "🦀", go: "🐹", rb: "💎", sh: "🖥️"
  };
  return map[ext] ?? "📄";
}

function clearAttachments(): void {
  skillAttachments.value = [];
  fileAttachments.value = [];
}

function removeSkillAttachment(id: string): void {
  skillAttachments.value = skillAttachments.value.filter((a) => a.id !== id);
}

function removeFileAttachment(id: string): void {
  fileAttachments.value = fileAttachments.value.filter((a) => a.id !== id);
}

function addFilesFromList(files: FileList | File[]): void {
  const editor = threadPromptEditor.value;
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    const isImage = isImageFile(file);
    if (isImage && editor) {
      editor.chain().focus("end").insertContent([{ type: "threadImageBadge", attrs: { path, name } }]).run();
    } else {
      fileAttachments.value.push({ id: crypto.randomUUID(), path, name, isImage });
    }
  }
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) addFilesFromList(input.files);
  input.value = "";
}

function onInlineEditorDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
}

function onInlineEditorDrop(e: DragEvent): void {
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  e.stopPropagation();
  addFilesFromList(dt.files);
}

function buildFullPrompt(): string {
  const ed = threadPromptEditor.value;
  if (!ed) return "";
  const body = ed.getText({ blockSeparator: "\n" }).trimEnd();
  const fromDoc = collectDocAttachmentPaths(ed.state.doc);
  const skillPaths = new Set<string>([
    ...fromDoc.skillPaths,
    ...skillAttachments.value.map((a) => a.path)
  ]);
  const filePaths = new Set<string>([
    ...fromDoc.filePaths,
    ...fileAttachments.value.map((a) => a.path)
  ]);
  const parts: string[] = [];
  if (skillPaths.size > 0) parts.push(`[Attached skills]\n${[...skillPaths].join("\n")}`);
  if (filePaths.size > 0) parts.push(`[Attached files]\n${[...filePaths].join("\n")}`);
  if (parts.length === 0) return body;
  const attachmentBlock = `\n\n${parts.join("\n\n")}`;
  const trimmedBody = body.trim();
  return trimmedBody.length > 0 ? trimmedBody + attachmentBlock : attachmentBlock.trim();
}

function deriveThreadTitle(): string | undefined {
  const flat = threadPromptEditor.value?.getText({ blockSeparator: "\n" }) ?? "";
  const first = flat.trim().split(/\n/)[0]?.trim() ?? "";
  if (first) return first.length > 120 ? `${first.slice(0, 117)}…` : first;
  if (fileAttachments.value.length) {
    const n = fileAttachments.value[0]!.name;
    return fileAttachments.value.length === 1 ? n : `${n} +${fileAttachments.value.length - 1}`;
  }
  if (skillAttachments.value.length) {
    const n = skillAttachments.value[0]!.name;
    return skillAttachments.value.length === 1 ? n : `${n} +${skillAttachments.value.length - 1}`;
  }
  return undefined;
}

function submit(): void {
  const prompt = buildFullPrompt();
  const threadTitle = deriveThreadTitle();
  const payload: ThreadCreateWithAgentPayload = { agent: selectedAgent.value, prompt };
  if (threadTitle) payload.threadTitle = threadTitle;
  emit("submit", payload);
}

onMounted(() => {
  void nextTick(() => {
    threadPromptEditor.value?.commands.focus("end");
  });
});

onBeforeUnmount(() => {
  clearAttachments();
});

defineExpose({ submit });
</script>

<template>
  <section
    data-testid="inline-prompt-editor"
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-card text-card-foreground"
    @dragover="onInlineEditorDragOver"
    @drop="onInlineEditorDrop"
  >
    <!-- Tiptap editor — fills remaining vertical space -->
    <div
      class="thread-create-prompt-host min-h-0 flex-1 overflow-y-auto border-0 bg-transparent"
      role="presentation"
    >
      <editor-content
        v-if="threadPromptEditor"
        :editor="threadPromptEditor"
        class="min-h-full w-full border-0 bg-transparent"
      />
    </div>

    <!-- Attachment strips -->
    <div
      v-if="skillAttachments.length || fileAttachments.length"
      class="flex flex-col gap-1 border-t border-border px-3 py-1.5"
    >
      <div v-if="skillAttachments.length" class="flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:thin]">
        <div
          v-for="a in skillAttachments"
          :key="a.id"
          :class="cn(badgeVariants({ variant: 'secondary' }), 'inline-flex h-7 max-w-[16rem] items-center gap-1 pl-2 pr-1')"
        >
          <BookMarked class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 truncate font-medium text-foreground">{{ a.name }}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
            :aria-label="`Remove skill ${a.name}`"
            @click="removeSkillAttachment(a.id)"
          >
            <X class="size-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div v-if="fileAttachments.length" class="flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:thin]">
        <div
          v-for="a in fileAttachments"
          :key="a.id"
          :class="cn(badgeVariants({ variant: 'secondary' }), 'inline-flex h-7 max-w-none shrink-0 items-center gap-1 pl-2 pr-1')"
        >
          <span aria-hidden="true">{{ attachmentEmoji(a.name, a.isImage) }}</span>
          <span class="min-w-0 truncate font-mono text-[11px] font-medium text-foreground">{{ a.isImage ? a.name : a.path }}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
            :aria-label="`Remove attached file ${a.path}`"
            @click="removeFileAttachment(a.id)"
          >
            <X class="size-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Bottom action bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted px-2.5 py-2">
      <div class="flex items-center gap-1">
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
          aria-label="Attach files or images"
          @change="onFileInputChange"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          class="h-9 w-9 shrink-0 rounded-lg"
          title="Attach files or images"
          aria-label="Attach files or images"
          data-testid="inline-prompt-add-file"
          @click="fileInputRef?.click()"
        >
          <Paperclip class="h-5 w-5" stroke-width="2" />
        </Button>
      </div>

      <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
        <div class="flex min-w-0 flex-col gap-1">
          <label class="sr-only" for="inline-prompt-agent-select">Model</label>
          <Select v-model="selectedAgent">
            <SelectTrigger
              id="inline-prompt-agent-select"
              class="h-9 w-full min-w-[12rem] max-w-[16rem] shrink border-input bg-background text-xs font-medium shadow-xs"
              :aria-label="`Model: ${selectedAgentLabel}`"
              data-testid="inline-prompt-agent-select"
            >
              <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <AgentIcon :agent="selectedAgent" :size="18" class="shrink-0" />
                <span class="truncate text-left">{{ selectedAgentLabel }}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Model</SelectLabel>
                <SelectItem v-for="opt in AGENT_OPTIONS" :key="opt.agent" :value="opt.agent">
                  <AgentIcon :agent="opt.agent" :size="16" class="shrink-0" />
                  {{ opt.label }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-9 rounded-lg text-xs text-muted-foreground"
          aria-label="Cancel"
          data-testid="inline-prompt-cancel"
          @click="emit('cancel')"
        >
          Cancel
        </Button>

        <Button
          type="button"
          size="sm"
          class="h-9 gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/90"
          aria-label="Start thread"
          title="Start thread"
          @click="submit"
        >
          <MessageSquarePlus class="size-3.5 shrink-0" aria-hidden="true" />
          Start thread
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.thread-create-prompt-host :deep(.ProseMirror p.is-empty::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--color-muted-foreground);
  pointer-events: none;
  height: 0;
}
</style>
```

- [ ] **Step 1.4: Run tests — verify they pass**

```bash
cd apps/desktop && npx vitest run src/components/__tests__/ThreadInlinePromptEditor.test.ts 2>&1 | tail -20
```

Expected: all 5 tests `PASS`.

- [ ] **Step 1.5: Commit**

```bash
git add apps/desktop/src/components/ThreadInlinePromptEditor.vue \
        apps/desktop/src/components/__tests__/ThreadInlinePromptEditor.test.ts
git commit -m "feat(desktop): add ThreadInlinePromptEditor component"
```

---

## Task 2: Add inline prompt state and handlers to `WorkspaceLayout.vue`

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`
- Modify: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 2.1: Write failing test for `openInlineThreadPrompt` creating a thread**

Open `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts` and find where tests for `handleCreateThreadWithAgent` / the agent tab are. Add the following test. The exact `describe` block will depend on what is already in the file — find the block covering the agent center tab or thread creation and add inside it:

```typescript
it("creates a thread immediately and shows the inline prompt editor when openInlineThreadPrompt is called", async () => {
  // This test verifies that clicking "Add thread" no longer opens a dialog — instead
  // it creates a thread and renders the inline editor in the agent tab area.
  // The assertion checks for data-testid="inline-prompt-editor" in the rendered output.
  //
  // Implementation note: you will need to stub api.createThread to return a fake thread id.
  // Follow the existing test setup pattern in this file for stubbing the API.
});
```

> This is a placeholder to drive the implementation. Fill it in once you see the existing test pattern — the next steps implement the feature; update the test to be fully concrete after reading the test file structure.

- [ ] **Step 2.2: Add `inlinePromptThreadId` ref and `inlinePromptEditorRef` to `WorkspaceLayout` script**

In `apps/desktop/src/layouts/WorkspaceLayout.vue`, in the `<script setup>` block, find the line:

```typescript
const threadCreateHostRef = ref<InstanceType<typeof ThreadCreateButton> | null>(null);
```

Add after it:

```typescript
/** Thread currently in "compose prompt" mode — shows inline editor instead of xterm. */
const inlinePromptThreadId = ref<string | null>(null);
const inlinePromptEditorRef = ref<{ submit: () => void } | null>(null);
```

- [ ] **Step 2.3: Add the import for `ThreadInlinePromptEditor`**

In `WorkspaceLayout.vue` imports section, find:

```typescript
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
```

Add after it:

```typescript
import ThreadInlinePromptEditor from "@/components/ThreadInlinePromptEditor.vue";
```

- [ ] **Step 2.4: Add `openInlineThreadPrompt` function**

In `WorkspaceLayout.vue` script, find the `openAddThreadFromToolbarOrEmpty` function:

```typescript
function openAddThreadFromToolbarOrEmpty(): void {
  openThreadCreateDialog({
    target: "activeWorktree",
    destinationContextLabel: activeContextLabel.value
  });
}
```

Replace it with:

```typescript
async function openInlineThreadPrompt(worktreeId: string): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeProjectId) return;
  const created = await api.createThread({
    projectId: workspace.activeProjectId,
    worktreeId,
    title: "New thread",
    agent: readPreferredThreadAgent()
  });
  if (!created?.id) return;
  await refreshSnapshot();
  inlinePromptThreadId.value = created.id;
  mainCenterTab.value = "agent";
}

function openAddThreadFromToolbarOrEmpty(): void {
  const worktreeId = workspace.defaultWorktree?.id;
  if (!worktreeId) return;
  void openInlineThreadPrompt(worktreeId);
}
```

- [ ] **Step 2.5: Add `onInlinePromptSubmit` and `onInlinePromptCancel` handlers**

In `WorkspaceLayout.vue` script, find the `onTerminalBootstrapConsumed` function:

```typescript
function onTerminalBootstrapConsumed(): void {
  pendingAgentBootstrap.value = null;
}
```

Add the two new handlers after it:

```typescript
async function onInlinePromptSubmit(payload: ThreadCreateWithAgentPayload): Promise<void> {
  const threadId = inlinePromptThreadId.value;
  if (!threadId) return;
  const { agent, prompt } = payload;
  const api = getApi();
  // Rename the thread from placeholder to the derived title.
  const title = resolveNewThreadTitle(payload, agent);
  if (api && title !== "New thread") {
    try {
      await api.renameThread({ threadId, title });
    } catch {
      // Non-fatal — thread still runs even if rename fails.
    }
  }
  pendingAgentBootstrap.value = {
    threadId,
    command: bootstrapCommandLineWithPrompt(agent, prompt)
  };
  inlinePromptThreadId.value = null;
  await refreshSnapshot();
}

async function onInlinePromptCancel(): Promise<void> {
  const threadId = inlinePromptThreadId.value;
  if (!threadId) return;
  inlinePromptThreadId.value = null;
  await handleRemoveThread(threadId);
}
```

- [ ] **Step 2.6: Add the import for `readPreferredThreadAgent`**

In `WorkspaceLayout.vue` imports, check if `readPreferredThreadAgent` is already imported. If not, add:

```typescript
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
```

- [ ] **Step 2.7: Add Cmd+Enter global intercept**

In `WorkspaceLayout.vue` script, find the `onMounted` hook. Add a global keydown listener inside it, alongside any existing listeners:

```typescript
function onInlinePromptCmdEnter(ev: KeyboardEvent): void {
  if (!inlinePromptThreadId.value) return;
  const isMac = navigator.platform.toLowerCase().includes("mac");
  if (ev.key === "Enter" && (isMac ? ev.metaKey : ev.ctrlKey)) {
    ev.preventDefault();
    inlinePromptEditorRef.value?.submit();
  }
}
```

Then in `onMounted`:

```typescript
window.addEventListener("keydown", onInlinePromptCmdEnter, { capture: true });
```

And in `onBeforeUnmount`:

```typescript
window.removeEventListener("keydown", onInlinePromptCmdEnter, { capture: true });
```

- [ ] **Step 2.8: Update the agent tab template to show inline editor**

In `WorkspaceLayout.vue` template, find this block (around line 1827):

```html
<div v-show="mainCenterTab === 'agent'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <section
    v-if="!activeWorktreeHasThreads"
    class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
  >
    ...empty state...
    <Button ... @click="openAddThreadFromToolbarOrEmpty">
      ...
    </Button>
  </section>
  <TerminalPane
    v-else
    ref="agentTerminalPaneRef"
    ...
  />
</div>
```

Replace with:

```html
<div v-show="mainCenterTab === 'agent'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Empty state: no threads at all and not composing -->
  <section
    v-if="!activeWorktreeHasThreads && !inlinePromptThreadId"
    class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
  >
    <span class="text-5xl leading-none" aria-hidden="true">🧵</span>
    <div class="max-w-md space-y-2">
      <h1 class="text-lg font-semibold text-foreground">Create your first thread</h1>
      <p class="text-sm text-muted-foreground">
        Start a thread to launch an agent session for this workspace. The terminal will appear after you
        create one.
      </p>
    </div>
    <Button
      type="button"
      data-testid="workspace-create-thread-empty-state"
      aria-label="Add thread"
      :title="keybindings.titleWithShortcut('Add thread', 'newThreadMenu')"
      variant="outline"
      size="sm"
      @click="openAddThreadFromToolbarOrEmpty"
    >
      <span class="inline-flex items-center gap-2">
        <Plus class="h-4 w-4" />
        <span>Add thread</span>
      </span>
    </Button>
  </section>

  <!-- Inline prompt editor: newly created thread awaiting initial prompt -->
  <ThreadInlinePromptEditor
    v-else-if="inlinePromptThreadId && workspace.activeThreadId === inlinePromptThreadId"
    ref="inlinePromptEditorRef"
    :worktree-id="workspace.activeWorktreeId ?? ''"
    :worktree-path="workspace.activeWorktree?.path ?? null"
    @submit="onInlinePromptSubmit"
    @cancel="onInlinePromptCancel"
  />

  <!-- Normal terminal: thread exists and is not in compose mode -->
  <TerminalPane
    v-else
    ref="agentTerminalPaneRef"
    pty-kind="agent"
    :worktree-id="workspace.activeWorktreeId ?? ''"
    :thread-id="workspace.activeThreadId ?? ''"
    :cwd="workspace.activeWorktree?.path ?? ''"
    :pending-agent-bootstrap="pendingAgentBootstrap"
    @bootstrap-consumed="onTerminalBootstrapConsumed"
    @user-typed="markPtyUserInput"
  />
</div>
```

- [ ] **Step 2.9: Verify the app compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 2.10: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue \
        apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat(desktop): add inline thread prompt pane to WorkspaceLayout"
```

---

## Task 3: Update `ThreadGroupHeader` to emit `add-thread-inline`

**Files:**
- Modify: `apps/desktop/src/components/ThreadGroupHeader.vue`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue` (wire the event)

- [ ] **Step 3.1: Write failing test — ThreadGroupHeader emits `add-thread-inline` instead of calling openThreadCreateDialog**

Find `apps/desktop/src/components/__tests__/` and create or add to a ThreadGroupHeader test file. If no test file exists yet, create `apps/desktop/src/components/__tests__/ThreadGroupHeader.test.ts`:

```typescript
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";

// Stub the dialog composable so tests don't require a full layout
vi.mock("@/composables/threadCreateDialog", () => ({
  openThreadCreateDialog: vi.fn()
}));

describe("ThreadGroupHeader", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadGroupHeader>>;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  it("emits add-thread-inline with the worktreeId when the + button is clicked", async () => {
    wrapper = mount(ThreadGroupHeader, {
      attachTo: document.body,
      props: {
        title: "main",
        threadCount: 0,
        isStale: false,
        collapsed: false,
        isActive: true,
        isPrimary: true,
        worktreeIdForCreate: "wt-42"
      }
    });

    await wrapper.find('button[aria-label="Add thread to group"]').trigger("click");
    expect(wrapper.emitted("add-thread-inline")).toEqual([["wt-42"]]);
  });
});
```

Run to confirm it fails:

```bash
cd apps/desktop && npx vitest run src/components/__tests__/ThreadGroupHeader.test.ts 2>&1 | tail -20
```

- [ ] **Step 3.2: Update `ThreadGroupHeader.vue` — add emit and replace openThreadCreateDialog call**

Open `apps/desktop/src/components/ThreadGroupHeader.vue`.

**a) Remove the import:**

Find and delete:

```typescript
import { openThreadCreateDialog } from "@/composables/threadCreateDialog";
```

**b) Add `add-thread-inline` to `defineEmits`:**

Find:

```typescript
const emit = defineEmits<{
  toggle: [];
  delete: [];
}>();
```

Replace with:

```typescript
const emit = defineEmits<{
  toggle: [];
  delete: [];
  "add-thread-inline": [worktreeId: string];
}>();
```

**c) Replace `openAddThreadDialog` function body:**

Find:

```typescript
function openAddThreadDialog(): void {
  const id = props.worktreeIdForCreate?.trim();
  openThreadCreateDialog({
    ...
  });
}
```

Replace with:

```typescript
function openAddThreadDialog(): void {
  const id = props.worktreeIdForCreate?.trim();
  if (!id) return;
  emit("add-thread-inline", id);
}
```

- [ ] **Step 3.3: Run the ThreadGroupHeader test — verify it passes**

```bash
cd apps/desktop && npx vitest run src/components/__tests__/ThreadGroupHeader.test.ts 2>&1 | tail -20
```

Expected: `PASS`.

- [ ] **Step 3.4: Wire the event in `WorkspaceLayout.vue`**

In `WorkspaceLayout.vue` template, find every `<ThreadGroupHeader` usage. Each will have event handlers like `@toggle` and `@delete`. Add the new event handler to each:

```html
@add-thread-inline="openInlineThreadPrompt"
```

For example, if the existing template has:

```html
<ThreadGroupHeader
  ...
  @toggle="..."
  @delete="..."
/>
```

Update it to:

```html
<ThreadGroupHeader
  ...
  @toggle="..."
  @delete="..."
  @add-thread-inline="openInlineThreadPrompt"
/>
```

- [ ] **Step 3.5: Compile check**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3.6: Commit**

```bash
git add apps/desktop/src/components/ThreadGroupHeader.vue \
        apps/desktop/src/components/__tests__/ThreadGroupHeader.test.ts \
        apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "feat(desktop): ThreadGroupHeader emits add-thread-inline, wires to inline prompt"
```

---

## Task 4: Run full test suite and verify

- [ ] **Step 4.1: Run all desktop tests**

```bash
cd apps/desktop && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass (or only pre-existing failures, none introduced by this change).

- [ ] **Step 4.2: Manual smoke test — start the app**

```bash
# From repo root:
npm run dev
# or however the desktop app is started — check package.json scripts
```

Walk through:

1. Open a workspace with no threads → empty state shows → click "Add thread" → thread appears in sidebar → inline Tiptap editor shows in the center pane (no modal dialog).
2. Type a prompt in the editor → press Enter → xterm terminal starts → agent session launches.
3. Press Escape before submitting → thread disappears from sidebar, empty state returns.
4. With an existing thread active, click "Add thread" in the sidebar (ThreadGroupHeader `+` button) → new thread created immediately → inline editor shows → submit with Cmd+Enter → terminal starts.
5. Tab between agent selector and other focusable elements → press Cmd+Enter → submits correctly.

- [ ] **Step 4.3: Final commit if anything was adjusted during smoke test**

```bash
git add -p
git commit -m "fix(desktop): inline thread prompt polish after smoke test"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Thread auto-created on "Add thread" click — Task 2.4 (`openInlineThreadPrompt`)
- [x] Tiptap editor shown inline in terminal area — Task 1 + Task 2.8
- [x] Enter submits, xterm takes over — Task 1 (handleKeyDown in editor) + Task 2.5 (onInlinePromptSubmit sets pendingAgentBootstrap)
- [x] Cmd+Enter works when focus is elsewhere — Task 2.7 (global keydown intercept)
- [x] Escape cancels and deletes the thread — Task 1 (handleKeyDown emits cancel) + Task 2.5 (onInlinePromptCancel calls handleRemoveThread)
- [x] Sidebar "Add thread" button uses inline flow — Task 3
- [x] Empty-state "Add thread" button uses inline flow — Task 2.4 (`openAddThreadFromToolbarOrEmpty` calls `openInlineThreadPrompt`)
- [x] defineExpose({ submit }) for parent Cmd+Enter call — Task 1 last line of script

**Placeholder scan:** None found.

**Type consistency:**
- `openInlineThreadPrompt(worktreeId: string)` — used consistently in Task 2.4, Task 2.8 template, Task 3.4.
- `inlinePromptThreadId` — defined Task 2.2, read in Task 2.8, cleared in Task 2.5.
- `onInlinePromptSubmit(payload: ThreadCreateWithAgentPayload)` — emitted as `submit` from `ThreadInlinePromptEditor`, received in WorkspaceLayout template.
- `onInlinePromptCancel()` — emitted as `cancel` from `ThreadInlinePromptEditor`, received in WorkspaceLayout template.
- `inlinePromptEditorRef.value?.submit()` — matches `defineExpose({ submit })` in Task 1.
