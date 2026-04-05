# Thread System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement compact thread rows with agent icons, an agent grid picker, and rename/delete with PTY session cleanup.

**Architecture:** New `AgentIcon.vue` holds all brand SVGs. New `ThreadRow.vue` handles per-row hover menu and inline rename. `ThreadSidebar.vue` is updated to use `ThreadRow` and replace the vertical picker with a 4-button grid. Backend gets `deleteThread`/`renameThread` IPC channels wired through store → service → main → preload.

**Tech Stack:** Vue 3 + TypeScript, Pinia, Tailwind CSS, better-sqlite3, Electron IPC, Vitest + @vue/test-utils

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/shared/ipc.ts` | Add `workspaceDeleteThread`/`workspaceRenameThread` channels + input types |
| Modify | `src/env.d.ts` | Add `deleteThread`/`renameThread` to `WorkspaceApi` |
| Modify | `electron/storage/store.ts` | Add `deleteThread(id)` and `renameThread(id, title)` |
| Modify | `electron/services/workspaceService.ts` | Add `deleteThread` and `renameThread` methods |
| Modify | `electron/main.ts` | Register two new IPC handlers |
| Modify | `electron/preload.ts` | Expose `deleteThread`/`renameThread` on `workspaceApi` |
| Create | `src/components/ui/AgentIcon.vue` | Renders brand SVG for each `ThreadAgent` |
| Create | `src/components/ThreadRow.vue` | Compact row: icon + title + hover menu (rename/delete) |
| Create | `src/components/__tests__/ThreadRow.test.ts` | Unit tests for ThreadRow |
| Modify | `src/components/ThreadSidebar.vue` | Use ThreadRow, grid picker, add remove/rename emits |
| Modify | `src/components/__tests__/ThreadSidebar.test.ts` | Add tests for remove/rename forwarding |
| Modify | `src/layouts/WorkspaceLayout.vue` | Add handleRemoveThread + handleRenameThread |

---

## Task 1: IPC contracts

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add channels and input types to ipc.ts**

In `src/shared/ipc.ts`, add two entries to `IPC_CHANNELS` and two interfaces. The existing object ends at `dialogPickRepoDirectory`; add after it:

```ts
// In IPC_CHANNELS object, add:
workspaceDeleteThread: "workspace:deleteThread",
workspaceRenameThread: "workspace:renameThread",
```

Add these interfaces after `AddWorktreeInput`:

```ts
export interface DeleteThreadInput {
  threadId: string;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}
```

- [ ] **Step 2: Add methods to WorkspaceApi in env.d.ts**

In `src/env.d.ts`, add two lines to the `WorkspaceApi` interface after `setActiveThread`:

```ts
deleteThread: (payload: { threadId: string }) => Promise<void>;
renameThread: (payload: { threadId: string; title: string }) => Promise<void>;
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts src/env.d.ts
git commit -m "feat: add deleteThread and renameThread IPC contracts"
```

---

## Task 2: Store layer

**Files:**
- Modify: `electron/storage/store.ts`

- [ ] **Step 1: Add deleteThread and renameThread to WorkspaceStore**

In `electron/storage/store.ts`, add these two methods to the `WorkspaceStore` class after `upsertThread`:

```ts
deleteThread(id: string): void {
  this.db.prepare("DELETE FROM threads WHERE id = ?").run(id);
}

renameThread(id: string, title: string): void {
  const updatedAt = new Date().toISOString();
  this.db
    .prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?")
    .run(title, updatedAt, id);
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/storage/store.ts
git commit -m "feat: add deleteThread and renameThread to WorkspaceStore"
```

---

## Task 3: Service + backend wiring

**Files:**
- Modify: `electron/services/workspaceService.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add methods to WorkspaceService**

In `electron/services/workspaceService.ts`, add these two methods after `createThread`:

```ts
deleteThread(threadId: string): void {
  this.store.deleteThread(threadId);
}

renameThread(threadId: string, title: string): void {
  this.store.renameThread(threadId, title);
}
```

- [ ] **Step 2: Update the import in main.ts**

In `electron/main.ts`, add `DeleteThreadInput` and `RenameThreadInput` to the IPC import:

```ts
import {
  IPC_CHANNELS,
  type AddProjectInput,
  type AddWorktreeInput,
  type CreateThreadInput,
  type DeleteThreadInput,
  type RenameThreadInput
} from "../src/shared/ipc.js";
```

- [ ] **Step 3: Register IPC handlers in main.ts**

In `electron/main.ts`, inside `registerIpc`, add these two handlers after the `workspaceSetActiveThread` handler:

```ts
ipcMain.handle(IPC_CHANNELS.workspaceDeleteThread, (_, payload: DeleteThreadInput) => {
  workspaceService.deleteThread(payload.threadId);
});
ipcMain.handle(IPC_CHANNELS.workspaceRenameThread, (_, payload: RenameThreadInput) => {
  workspaceService.renameThread(payload.threadId, payload.title);
});
```

- [ ] **Step 4: Expose on preload**

In `electron/preload.ts`, inside `contextBridge.exposeInMainWorld("workspaceApi", { ... })`, add after `setActiveThread`:

```ts
deleteThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDeleteThread, payload),
renameThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRenameThread, payload),
```

- [ ] **Step 5: Commit**

```bash
git add electron/services/workspaceService.ts electron/main.ts electron/preload.ts
git commit -m "feat: wire deleteThread and renameThread through service, IPC, and preload"
```

---

## Task 4: AgentIcon.vue

**Files:**
- Create: `src/components/ui/AgentIcon.vue`

- [ ] **Step 1: Create the component**

Create `src/components/ui/AgentIcon.vue`:

```vue
<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";

defineProps<{
  agent: ThreadAgent;
  size?: number;
}>();
</script>

<template>
  <svg
    :width="size ?? 14"
    :height="size ?? 14"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <!-- Anthropic -->
    <path
      v-if="agent === 'claude'"
      d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"
    />
    <!-- OpenAI -->
    <path
      v-else-if="agent === 'codex'"
      d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
    />
    <!-- Cursor -->
    <path
      v-else-if="agent === 'cursor'"
      d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
    />
    <!-- Google Gemini -->
    <path
      v-else-if="agent === 'gemini'"
      d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
    />
  </svg>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/AgentIcon.vue
git commit -m "feat: add AgentIcon component with brand SVGs for all four agents"
```

---

## Task 5: ThreadRow.vue with tests (TDD)

**Files:**
- Create: `src/components/__tests__/ThreadRow.test.ts`
- Create: `src/components/ThreadRow.vue`

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/ThreadRow.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ThreadRow from "@/components/ThreadRow.vue";
import type { Thread } from "@shared/domain";

const thread: Thread = {
  id: "t1",
  projectId: "p1",
  worktreeId: "w1",
  title: "Claude Code · Apr 5",
  agent: "claude",
  createdAt: "2026-04-05T00:00:00.000Z",
  updatedAt: "2026-04-05T00:00:00.000Z"
};

describe("ThreadRow", () => {
  it("emits select when the title button is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-select"]').trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("applies active styling when isActive is true", () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: true } });
    expect(wrapper.get('[data-testid="thread-row"]').classes()).toContain("bg-accent");
  });

  it("opens the action menu when the chevron button is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    expect(wrapper.find('[data-testid="thread-delete"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="thread-rename"]').exists()).toBe(true);
  });

  it("emits remove when Delete menu item is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-delete"]').trigger("click");
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });

  it("enters inline edit mode when Rename is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(true);
    expect((wrapper.get('[data-testid="thread-rename-input"]').element as HTMLInputElement).value).toBe(thread.title);
  });

  it("emits rename with new title on Enter", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("New Title");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["New Title"]]);
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("cancels rename on Escape without emitting", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename-input"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("does not emit rename when confirmed with empty value", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("   ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/components/__tests__/ThreadRow.test.ts
```

Expected: FAIL — `Cannot find module '@/components/ThreadRow.vue'`

- [ ] **Step 3: Create ThreadRow.vue**

Create `src/components/ThreadRow.vue`:

```vue
<script setup lang="ts">
import type { Thread } from "@shared/domain";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";

const props = defineProps<{
  thread: Thread;
  isActive: boolean;
}>();

const emit = defineEmits<{
  select: [];
  remove: [];
  rename: [newTitle: string];
}>();

const menuOpen = ref(false);
const isEditing = ref(false);
const editValue = ref("");
const menuRootRef = ref<HTMLElement | null>(null);
const editInputRef = ref<HTMLInputElement | null>(null);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function startRename(): void {
  closeMenu();
  editValue.value = props.thread.title;
  isEditing.value = true;
  void nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
}

function confirmRename(): void {
  const val = editValue.value.trim();
  if (val) emit("rename", val);
  isEditing.value = false;
}

function cancelRename(): void {
  isEditing.value = false;
}

function handleRenameKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") confirmRename();
  else if (event.key === "Escape") cancelRename();
}

function handleDelete(): void {
  closeMenu();
  emit("remove");
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (!menuOpen.value) return;
  if (menuRootRef.value && !menuRootRef.value.contains(event.target as Node)) {
    closeMenu();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeMenu();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <div
    data-testid="thread-row"
    class="group relative flex min-w-0 items-center gap-1.5 rounded-sm px-2 py-1"
    :class="isActive ? 'bg-accent' : 'hover:bg-accent/50'"
  >
    <AgentIcon :agent="thread.agent" :size="14" class="shrink-0 text-muted-foreground" />

    <button
      v-if="!isEditing"
      data-testid="thread-select"
      type="button"
      class="min-w-0 flex-1 truncate text-left text-sm"
      @click="emit('select')"
    >
      {{ thread.title }}
    </button>
    <input
      v-else
      ref="editInputRef"
      v-model="editValue"
      data-testid="thread-rename-input"
      type="text"
      class="min-w-0 flex-1 rounded border border-border bg-background px-1 text-sm outline-none"
      @keydown="handleRenameKeydown"
      @blur="cancelRename"
    />

    <div
      ref="menuRootRef"
      class="relative shrink-0 opacity-0 group-hover:opacity-100"
      :class="{ '!opacity-100': menuOpen }"
    >
      <button
        type="button"
        data-testid="thread-menu-trigger"
        class="rounded p-0.5 hover:bg-accent"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click.stop="toggleMenu"
      >
        <ChevronDown class="h-3 w-3" />
      </button>
      <div
        v-show="menuOpen"
        class="absolute right-0 top-full z-50 mt-0.5 min-w-[8rem] rounded-md border border-border bg-popover p-1 shadow-md"
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          data-testid="thread-rename"
          class="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          @click="startRename"
        >
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="thread-delete"
          class="w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
          @click="handleDelete"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/components/__tests__/ThreadRow.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ThreadRow.vue src/components/__tests__/ThreadRow.test.ts
git commit -m "feat: add ThreadRow component with hover menu, inline rename, and delete"
```

---

## Task 6: Update ThreadSidebar.vue

**Files:**
- Modify: `src/components/ThreadSidebar.vue`
- Modify: `src/components/__tests__/ThreadSidebar.test.ts`

- [ ] **Step 1: Add new tests for remove/rename forwarding**

Add these two tests to `src/components/__tests__/ThreadSidebar.test.ts` inside the existing `describe("ThreadSidebar", ...)` block:

```ts
it("emits remove with threadId when a ThreadRow emits remove", async () => {
  const wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
  await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
  await wrapper.get('[data-testid="thread-delete"]').trigger("click");
  expect(wrapper.emitted("remove")).toEqual([["t1"]]);
});

it("emits rename with threadId and new title when a ThreadRow emits rename", async () => {
  const wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
  await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
  await wrapper.get('[data-testid="thread-rename"]').trigger("click");
  const input = wrapper.get('[data-testid="thread-rename-input"]');
  await input.setValue("Renamed");
  await input.trigger("keydown", { key: "Enter" });
  expect(wrapper.emitted("rename")).toEqual([["t1", "Renamed"]]);
});
```

- [ ] **Step 2: Run tests — confirm new ones fail**

```bash
npx vitest run src/components/__tests__/ThreadSidebar.test.ts
```

Expected: the two new tests FAIL (ThreadRow not used yet, no remove/rename emits)

- [ ] **Step 3: Replace ThreadSidebar.vue**

Replace the entire contents of `src/components/ThreadSidebar.vue`:

```vue
<script setup lang="ts">
import type { Thread, ThreadAgent } from "@shared/domain";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { PanelLeftClose, Plus } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import ThreadRow from "@/components/ThreadRow.vue";

defineProps<{
  threads: Thread[];
  activeThreadId: string | null;
}>();

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, newTitle: string];
  collapse: [];
}>();

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini" }
];

const popoverOpen = ref(false);
const menuRootRef = ref<HTMLElement | null>(null);
const menuId = "thread-agent-menu";

function togglePopover(): void {
  popoverOpen.value = !popoverOpen.value;
}

function closePopover(): void {
  popoverOpen.value = false;
}

function pickAgent(agent: ThreadAgent): void {
  emit("createWithAgent", agent);
  closePopover();
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (!popoverOpen.value) return;
  const root = menuRootRef.value;
  if (root && !root.contains(event.target as Node)) {
    closePopover();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closePopover();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <aside class="flex h-full flex-col border-r border-border pt-1 pb-3 pl-3 pr-1.5">
    <header class="mb-3 flex min-w-0 items-center gap-2">
      <h2 class="min-w-0 flex-1 text-sm font-semibold">Threads</h2>
      <div class="flex shrink-0 items-center justify-end gap-1.5">
        <div ref="menuRootRef" class="relative">
          <BaseButton
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label="New thread"
            title="New thread"
            :aria-expanded="popoverOpen"
            :aria-controls="menuId"
            aria-haspopup="menu"
            @click="togglePopover"
          >
            <Plus class="h-3.5 w-3.5" />
          </BaseButton>
          <div
            v-show="popoverOpen"
            :id="menuId"
            class="absolute top-full right-0 z-50 mt-1 min-w-[18rem] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
            role="menu"
            aria-label="Choose agent for new thread"
          >
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="opt in AGENT_OPTIONS"
                :key="opt.agent"
                type="button"
                role="menuitem"
                class="flex flex-col items-center gap-1.5 rounded-md px-2 py-3 text-center hover:bg-accent"
                @click="pickAgent(opt.agent)"
              >
                <AgentIcon :agent="opt.agent" :size="20" />
                <span class="text-xs">{{ opt.label }}</span>
              </button>
            </div>
          </div>
        </div>
        <BaseButton
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label="Collapse threads sidebar"
          title="Collapse threads sidebar"
          @click="emit('collapse')"
        >
          <PanelLeftClose class="h-3.5 w-3.5" />
        </BaseButton>
      </div>
    </header>
    <ul class="space-y-0.5">
      <li v-for="thread in threads" :key="thread.id">
        <ThreadRow
          :thread="thread"
          :is-active="thread.id === activeThreadId"
          @select="emit('select', thread.id)"
          @remove="emit('remove', thread.id)"
          @rename="(title) => emit('rename', thread.id, title)"
        />
      </li>
    </ul>
  </aside>
</template>
```

- [ ] **Step 4: Run all ThreadSidebar tests**

```bash
npx vitest run src/components/__tests__/ThreadSidebar.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ThreadSidebar.vue src/components/__tests__/ThreadSidebar.test.ts
git commit -m "feat: update ThreadSidebar with grid picker and ThreadRow, add remove/rename emits"
```

---

## Task 7: WorkspaceLayout.vue handlers

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Add imports**

In `src/layouts/WorkspaceLayout.vue`, update the import from `@shared/ipc` to include the new types:

```ts
import type { AddProjectInput, CreateThreadInput, DeleteThreadInput, RenameThreadInput, WorkspaceSnapshot } from "@shared/ipc";
```

- [ ] **Step 2: Add handleRemoveThread**

In `src/layouts/WorkspaceLayout.vue`, add this function after `handleCreateThreadWithAgent`:

```ts
async function handleRemoveThread(threadId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const wasActive = workspace.activeThreadId === threadId;
  const nextThread = wasActive
    ? workspace.activeThreads.find((t) => t.id !== threadId) ?? null
    : null;
  await api.ptyKill(threadId);
  const payload: DeleteThreadInput = { threadId };
  await api.deleteThread(payload);
  if (wasActive) {
    await api.setActive({
      projectId: workspace.activeProjectId,
      worktreeId: workspace.activeWorktreeId,
      threadId: nextThread?.id ?? null
    });
  }
  await refreshSnapshot();
}
```

- [ ] **Step 3: Add handleRenameThread**

Add this function directly after `handleRemoveThread`:

```ts
async function handleRenameThread(threadId: string, newTitle: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const payload: RenameThreadInput = { threadId, title: newTitle };
  await api.renameThread(payload);
  await refreshSnapshot();
}
```

- [ ] **Step 4: Wire events on ThreadSidebar in the template**

Find the `<ThreadSidebar` component in the template and add two event handlers:

```html
<ThreadSidebar
  v-if="threadsVisible"
  :threads="workspace.activeThreads"
  :active-thread-id="workspace.activeThreadId"
  @create-with-agent="handleCreateThreadWithAgent"
  @select="handleSelectThread"
  @remove="handleRemoveThread"
  @rename="handleRenameThread"
  @collapse="threadsVisible = false"
/>
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue
git commit -m "feat: handle thread remove and rename in WorkspaceLayout with PTY cleanup"
```
