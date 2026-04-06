<script setup lang="ts">
import type { RunStatus, Thread, ThreadAgent } from "@shared/domain";
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import { titleWithShortcut } from "@/keybindings/registry";

const props = defineProps<{
  threads: Thread[];
  activeThreadId: string | null;
  /** Narrow rail: agent icons only, no titles. */
  collapsed?: boolean;
  runStatusByThreadId?: Record<string, RunStatus>;
  /** Thread ids whose agent terminal fired attention while not visible. */
  threadsNeedingAttention?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, newTitle: string];
  reorder: [threadIds: string[]];
  collapse: [];
  expand: [];
}>();

const topBarRef = ref<InstanceType<typeof ThreadTopBar> | null>(null);

const renderedThreads = ref<Thread[]>([...props.threads]);
const draggedThreadId = ref<string | null>(null);
const dragOverThreadId = ref<string | null>(null);
const dropCompleted = ref(false);

function getThreadIds(threads: Thread[]): string[] {
  return threads.map((thread) => thread.id);
}

function hasVisibleOrderChanged(): boolean {
  const currentIds = getThreadIds(renderedThreads.value);
  const originalIds = getThreadIds(props.threads);

  return currentIds.some((threadId, index) => threadId !== originalIds[index]);
}

watch(
  () => props.threads,
  (threads) => {
    if (draggedThreadId.value) return;
    renderedThreads.value = [...threads];
  },
  { immediate: true }
);

function moveThread(threadId: string, targetThreadId: string): void {
  if (threadId === targetThreadId) return;

  const currentIndex = renderedThreads.value.findIndex((thread) => thread.id === threadId);
  const targetIndex = renderedThreads.value.findIndex((thread) => thread.id === targetThreadId);

  if (currentIndex === -1 || targetIndex === -1) return;

  const next = [...renderedThreads.value];
  const [thread] = next.splice(currentIndex, 1);

  if (!thread) return;

  next.splice(targetIndex, 0, thread);
  renderedThreads.value = next;
}

function moveThreadByOffset(threadId: string, offset: -1 | 1): boolean {
  const currentIndex = renderedThreads.value.findIndex((thread) => thread.id === threadId);
  if (currentIndex === -1) return false;

  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= renderedThreads.value.length) return false;

  const next = [...renderedThreads.value];
  const [thread] = next.splice(currentIndex, 1);
  if (!thread) return false;

  next.splice(targetIndex, 0, thread);
  renderedThreads.value = next;
  return true;
}

function syncFromProps(): void {
  renderedThreads.value = [...props.threads];
}

function handleDragStart(threadId: string, event: DragEvent): void {
  dropCompleted.value = false;
  draggedThreadId.value = threadId;
  dragOverThreadId.value = threadId;
  event.dataTransfer?.setData("text/plain", threadId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleDragEnter(targetThreadId: string): void {
  if (!draggedThreadId.value) return;
  moveThread(draggedThreadId.value, targetThreadId);
  dragOverThreadId.value = targetThreadId;
}

function handleDragOver(event: DragEvent): void {
  if (!draggedThreadId.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function clearDragState(): void {
  draggedThreadId.value = null;
  dragOverThreadId.value = null;
}

function finishDrop(): void {
  if (!draggedThreadId.value) return;

  if (hasVisibleOrderChanged()) {
    emit("reorder", getThreadIds(renderedThreads.value));
  } else {
    syncFromProps();
  }

  draggedThreadId.value = null;
  dragOverThreadId.value = null;
}

function cancelDrag(): void {
  if (!draggedThreadId.value) return;
  syncFromProps();
  dropCompleted.value = false;
  clearDragState();
}

function handleDrop(targetThreadId: string, event: DragEvent): void {
  if (!draggedThreadId.value) return;
  event.preventDefault();
  if (dragOverThreadId.value !== targetThreadId) {
    moveThread(draggedThreadId.value, targetThreadId);
  }
  dropCompleted.value = true;
  finishDrop();
}

function handleDragEnd(): void {
  if (dropCompleted.value) {
    dropCompleted.value = false;
    clearDragState();
    return;
  }
  cancelDrag();
}

function handleKeyboardReorder(threadId: string, direction: "up" | "down"): void {
  const moved = moveThreadByOffset(threadId, direction === "up" ? -1 : 1);
  if (!moved || !hasVisibleOrderChanged()) return;

  emit("reorder", getThreadIds(renderedThreads.value));
}

function openNewThreadMenu(): void {
  if (props.collapsed) {
    emit("expand");
    void nextTick(() => {
      topBarRef.value?.openNewThreadMenu();
    });
    return;
  }
  topBarRef.value?.openNewThreadMenu();
}

defineExpose({ openNewThreadMenu });
</script>

<template>
  <aside
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    :data-thread-sidebar-collapsed="collapsed ? 'true' : undefined"
  >
    <ThreadTopBar
      ref="topBarRef"
      :collapsed="collapsed"
      @create-with-agent="emit('createWithAgent', $event)"
    />
    <section
      v-if="threads.length === 0"
      class="flex min-h-0 flex-1 flex-col pt-6 pb-3"
      :class="collapsed ? 'px-1' : 'px-3'"
    >
      <template v-if="!collapsed">
        <h3 class="text-center text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          No threads
        </h3>
      </template>
    </section>
    <ul
      v-else
      class="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3 pl-2 pr-2 pt-2"
    >
      <li
        v-for="thread in renderedThreads"
        :key="thread.id"
        :data-testid="`thread-list-item-${thread.id}`"
        @dragenter.prevent="handleDragEnter(thread.id)"
        @dragover="handleDragOver"
        @drop="handleDrop(thread.id, $event)"
      >
        <ThreadRow
          :thread="thread"
          :collapsed="collapsed"
          :is-active="thread.id === activeThreadId"
          :run-status="runStatusByThreadId?.[thread.id] ?? null"
          :needs-attention="threadsNeedingAttention?.has(thread.id) ?? false"
          :is-dragging="thread.id === draggedThreadId"
          :is-drag-target="draggedThreadId !== null && thread.id === dragOverThreadId"
          @dragstart="handleDragStart(thread.id, $event)"
          @dragend="handleDragEnd"
          @keyboard-reorder="handleKeyboardReorder(thread.id, $event)"
          @select="emit('select', thread.id)"
          @remove="emit('remove', thread.id)"
          @rename="(title) => emit('rename', thread.id, title)"
        />
      </li>
    </ul>
    <footer
      class="shrink-0 border-t border-border p-2"
      :class="collapsed ? 'flex justify-center' : 'flex justify-end'"
    >
      <BaseButton
        type="button"
        size="icon-xs"
        variant="outline"
        :aria-label="collapsed ? 'Expand threads sidebar' : 'Collapse threads sidebar'"
        :title="collapsed
          ? titleWithShortcut('Expand threads sidebar', 'toggleThreadSidebar')
          : titleWithShortcut('Collapse threads sidebar', 'toggleThreadSidebar')"
        data-testid="thread-sidebar-toggle"
        @click="collapsed ? emit('expand') : emit('collapse')"
      >
        <PanelLeftOpen v-if="collapsed" class="h-3.5 w-3.5" />
        <PanelLeftClose v-else class="h-3.5 w-3.5" />
      </BaseButton>
    </footer>
  </aside>
</template>
