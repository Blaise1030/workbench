<script setup lang="ts">
import type { RunStatus, Thread, ThreadAgent, Worktree } from "@shared/domain";
import { Plus } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import BranchPicker from "@/components/BranchPicker.vue";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";
import WorktreeStaleCallout from "@/components/WorktreeStaleCallout.vue";
import { titleWithShortcut } from "@/keybindings/registry";

const props = withDefaults(
  defineProps<{
    threads: Thread[];
    activeThreadId: string | null;
    /** Narrow rail: agent icons only, no titles. */
    collapsed?: boolean;
    runStatusByThreadId?: Record<string, RunStatus>;
    /** Thread ids whose agent terminal fired attention while not visible. */
    threadsNeedingAttention?: ReadonlySet<string>;
    /** Non-default worktrees (thread groups). */
    threadGroups?: Worktree[];
    /** ID of the default worktree — threads with this worktreeId are "ungrouped". */
    defaultWorktreeId?: string | null;
    /** Worktree IDs whose path no longer exists on disk. */
    staleWorktreeIds?: ReadonlySet<string>;
    /** Whether the branch picker is visible. */
    showBranchPicker?: boolean;
    /** Active project ID for the branch picker. */
    projectId?: string | null;
  }>(),
  {
    collapsed: false,
    runStatusByThreadId: undefined,
    threadsNeedingAttention: undefined,
    threadGroups: () => [],
    defaultWorktreeId: null,
    staleWorktreeIds: () => new Set(),
    showBranchPicker: false,
    projectId: null
  }
);

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, newTitle: string];
  reorder: [threadIds: string[]];
  createWorktreeGroup: [branch: string, baseBranch: string | null];
  addThreadToGroup: [worktreeId: string, agent: ThreadAgent];
  cancelBranchPicker: [];
  showBranchPicker: [];
  deleteWorktreeGroup: [worktreeId: string];
  collapse: [];
  expand: [];
}>();

const createButtonRef = ref<InstanceType<typeof ThreadCreateButton> | null>(null);

const ungroupedThreads = computed(() => {
  if (!props.defaultWorktreeId) return props.threads;
  return props.threads.filter((t) => t.worktreeId === props.defaultWorktreeId);
});

const groupData = computed(() => {
  return (props.threadGroups ?? []).map((wt) => ({
    worktree: wt,
    threads: props.threads.filter((t) => t.worktreeId === wt.id),
    isStale: props.staleWorktreeIds?.has(wt.id) ?? false
  }));
});

const collapsedGroups = ref<Set<string>>(new Set());
const collapsedGroupTooltipId = `thread-group-collapsed-tooltip-${useId().replace(/:/g, "_")}`;
const hoveredCollapsedGroupId = ref<string | null>(null);
const focusedCollapsedGroupId = ref<string | null>(null);
const openCollapsedGroupId = ref<string | null>(null);
const collapsedGroupTooltipStyle = ref<Record<string, string>>({});
const collapsedGroupPopoverStyle = ref<Record<string, string>>({});
const collapsedGroupPopoverRef = ref<HTMLElement | null>(null);
const collapsedGroupTriggerRefs = new Map<string, HTMLElement>();

function toggleGroup(worktreeId: string): void {
  const next = new Set(collapsedGroups.value);
  if (next.has(worktreeId)) {
    next.delete(worktreeId);
  } else {
    next.add(worktreeId);
  }
  collapsedGroups.value = next;
}

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

const ungroupedRenderedThreads = computed(() => {
  if (!props.defaultWorktreeId) return renderedThreads.value;
  return renderedThreads.value.filter((t) => t.worktreeId === props.defaultWorktreeId);
});

const currentCollapsedTooltipGroup = computed(() => {
  const activeId = hoveredCollapsedGroupId.value ?? focusedCollapsedGroupId.value;
  if (!activeId || openCollapsedGroupId.value === activeId) return null;
  return groupData.value.find((group) => group.worktree.id === activeId) ?? null;
});

const openCollapsedPopoverGroup = computed(() => {
  if (!openCollapsedGroupId.value) return null;
  return groupData.value.find((group) => group.worktree.id === openCollapsedGroupId.value) ?? null;
});

watch(
  () => props.threads,
  (threads) => {
    if (draggedThreadId.value) return;
    renderedThreads.value = [...threads];
  },
  { immediate: true }
);

watch(
  [currentCollapsedTooltipGroup, openCollapsedPopoverGroup],
  async () => {
    await nextTick();
    updateCollapsedGroupFloatingPositions();
  }
);

watch(
  () => props.collapsed,
  (collapsed) => {
    if (!collapsed) {
      hoveredCollapsedGroupId.value = null;
      focusedCollapsedGroupId.value = null;
      openCollapsedGroupId.value = null;
    }
  }
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
  createButtonRef.value?.openMenu();
}

function setCollapsedGroupTriggerRef(worktreeId: string, el: Element | null): void {
  if (el instanceof HTMLElement) {
    collapsedGroupTriggerRefs.set(worktreeId, el);
  } else {
    collapsedGroupTriggerRefs.delete(worktreeId);
  }
}

function getCollapsedGroupTriggerRect(): DOMRect | null {
  const worktreeId = openCollapsedGroupId.value ?? currentCollapsedTooltipGroup.value?.worktree.id ?? null;
  if (!worktreeId) return null;
  return collapsedGroupTriggerRefs.get(worktreeId)?.getBoundingClientRect() ?? null;
}

function updateCollapsedGroupFloatingPositions(): void {
  const rect = getCollapsedGroupTriggerRect();
  if (!rect) return;

  collapsedGroupTooltipStyle.value = {
    left: `${Math.round(rect.right + 8)}px`,
    top: `${Math.round(rect.top + rect.height / 2)}px`
  };
  collapsedGroupPopoverStyle.value = {
    left: `${Math.round(rect.right + 8)}px`,
    top: `${Math.round(rect.top)}px`
  };
}

function handleCollapsedGroupPointerDown(event: MouseEvent): void {
  if (!openCollapsedGroupId.value) return;

  const activeTrigger = collapsedGroupTriggerRefs.get(openCollapsedGroupId.value);
  const target = event.target as Node;
  if (activeTrigger?.contains(target) || collapsedGroupPopoverRef.value?.contains(target)) return;

  openCollapsedGroupId.value = null;
}

function handleCollapsedGroupKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    openCollapsedGroupId.value = null;
  }
}

function toggleCollapsedGroupPopover(worktreeId: string): void {
  openCollapsedGroupId.value = openCollapsedGroupId.value === worktreeId ? null : worktreeId;
}

function handleCollapsedGroupSelect(threadId: string): void {
  openCollapsedGroupId.value = null;
  emit("select", threadId);
}

onMounted(() => {
  document.addEventListener("pointerdown", handleCollapsedGroupPointerDown);
  document.addEventListener("keydown", handleCollapsedGroupKeydown);
  window.addEventListener("resize", updateCollapsedGroupFloatingPositions);
  window.addEventListener("scroll", updateCollapsedGroupFloatingPositions, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleCollapsedGroupPointerDown);
  document.removeEventListener("keydown", handleCollapsedGroupKeydown);
  window.removeEventListener("resize", updateCollapsedGroupFloatingPositions);
  window.removeEventListener("scroll", updateCollapsedGroupFloatingPositions, true);
});

defineExpose({ openNewThreadMenu });
</script>

<template>
  <aside
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    :data-thread-sidebar-collapsed="collapsed ? 'true' : undefined"
  >
    <ThreadTopBar
      :collapsed="collapsed"
      @collapse="emit('collapse')"
      @expand="emit('expand')"
    />
    <BranchPicker
      v-if="showBranchPicker && projectId"
      :project-id="projectId"
      @create="(branch, baseBranch) => emit('createWorktreeGroup', branch, baseBranch)"
      @cancel="emit('cancelBranchPicker')"
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
    <div v-else class="min-h-0 flex-1 overflow-y-auto pb-3 pt-3">
      <!-- Ungrouped threads -->
      <ul class="space-y-0.5 px-2">
        <li
          v-for="thread in ungroupedRenderedThreads"
          :key="thread.id"
          :data-testid="`thread-list-item-${thread.id}`"
          @dragenter.prevent="handleDragEnter(thread.id)"
          @dragover="handleDragOver"
          @drop="handleDrop(thread.id, $event)"
        >
          <ThreadRow
            data-testid="thread-row"
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

      <!-- Thread groups -->
      <div
        v-for="(group, groupIndex) in groupData"
        :key="group.worktree.id"
        :class="groupIndex > 0 || ungroupedRenderedThreads.length > 0 ? 'mt-2' : ''"
      >
        <template v-if="collapsed">
          <div class="px-2">
            <button
              :ref="(el) => setCollapsedGroupTriggerRef(group.worktree.id, el)"
              type="button"
              data-testid="thread-group-collapsed-trigger"
              class="flex h-7 w-full items-center justify-center rounded-sm text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              :class="[
                group.threads.some((t) => t.id === activeThreadId)
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                group.isStale ? 'text-destructive/80' : ''
              ]"
              :aria-label="`Worktree ${group.worktree.name}`"
              :aria-describedby="currentCollapsedTooltipGroup?.worktree.id === group.worktree.id
                ? collapsedGroupTooltipId
                : undefined"
              :aria-expanded="openCollapsedGroupId === group.worktree.id"
              aria-haspopup="dialog"
              @mouseenter="hoveredCollapsedGroupId = group.worktree.id; updateCollapsedGroupFloatingPositions()"
              @mouseleave="hoveredCollapsedGroupId = hoveredCollapsedGroupId === group.worktree.id ? null : hoveredCollapsedGroupId"
              @focus="focusedCollapsedGroupId = group.worktree.id; updateCollapsedGroupFloatingPositions()"
              @blur="focusedCollapsedGroupId = focusedCollapsedGroupId === group.worktree.id ? null : focusedCollapsedGroupId"
              @click="toggleCollapsedGroupPopover(group.worktree.id)"
            >
              <span aria-hidden="true">🌳</span>
            </button>
          </div>
        </template>
        <template v-else>
          <ThreadGroupHeader
            data-testid="thread-group-header"
            :title="group.worktree.name"
            :branch="group.worktree.branch"
            :base-branch="group.worktree.baseBranch"
            :path="group.worktree.path"
            :thread-count="group.threads.length"
            :is-stale="group.isStale"
            :is-active="group.threads.some((t) => t.id === activeThreadId)"
            :collapsed="collapsedGroups.has(group.worktree.id)"
            @toggle="toggleGroup(group.worktree.id)"
            @add-thread="emit('addThreadToGroup', group.worktree.id, $event)"
            @delete="emit('deleteWorktreeGroup', group.worktree.id)"
          />

          <WorktreeStaleCallout
            v-if="group.isStale && group.threads.length > 0 && !collapsedGroups.has(group.worktree.id)"
            :branch="group.worktree.branch"
            @delete="emit('deleteWorktreeGroup', group.worktree.id)"
          />

          <ul
            v-show="!collapsedGroups.has(group.worktree.id)"
            class="space-y-0.5 px-2 pt-2"
            :class="'pl-3'"
          >
            <li
              v-for="thread in group.threads"
              :key="thread.id"
              :data-testid="`thread-list-item-${thread.id}`"
            >
              <ThreadRow
                data-testid="thread-row"
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
        </template>
      </div>
    </div>
    <footer
      class="shrink-0 w-full border-t border-border p-2 [&_button]:w-full"
      :class="collapsed ? 'flex justify-center' : 'flex justify-start'"
    >
      <ThreadCreateButton
        ref="createButtonRef"
        :aria-label="'Add thread'"
        :title="titleWithShortcut('Add thread', 'newThreadMenu')"
        variant="outline"
        class="w-full"
        :size="collapsed ? 'icon-xs' : 'sm'"
        data-testid="thread-sidebar-add-thread"
        @create-with-agent="emit('createWithAgent', $event)"
        @create-worktree-group="emit('showBranchPicker')"
      >
        <Plus class="h-3.5 w-3.5" />          
        <span v-if="!collapsed">Add thread</span>
      </ThreadCreateButton>
    </footer>
    <Teleport to="body">
      <div
        v-if="currentCollapsedTooltipGroup"
        :id="collapsedGroupTooltipId"
        data-testid="thread-group-collapsed-tooltip"
        role="tooltip"
        class="pointer-events-none fixed z-[200] max-w-[min(22rem,calc(100vw-2rem))] -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-2 text-left text-xs text-popover-foreground shadow-md"
        :style="collapsedGroupTooltipStyle"
      >
        <div class="font-medium leading-snug text-popover-foreground">
          {{ currentCollapsedTooltipGroup.worktree.name }}
        </div>
        <div class="mt-1 break-all font-normal leading-snug text-[11px] text-muted-foreground">
          {{ currentCollapsedTooltipGroup.worktree.path }}
        </div>
        <div class="mt-1.5 space-y-0.5 font-normal text-[11px] leading-snug text-muted-foreground">
          <div>
            Branch:
            <span class="text-foreground">{{ currentCollapsedTooltipGroup.worktree.branch }}</span>
          </div>
          <div>
            Source branch:
            <span class="text-foreground">{{
              currentCollapsedTooltipGroup.worktree.baseBranch?.trim()
                ? currentCollapsedTooltipGroup.worktree.baseBranch
                : "—"
            }}</span>
          </div>
        </div>
      </div>
      <div
        v-if="openCollapsedPopoverGroup"
        ref="collapsedGroupPopoverRef"
        data-testid="thread-group-collapsed-popover"
        role="dialog"
        class="fixed z-[200] w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md"
        :style="collapsedGroupPopoverStyle"
      >
        <div
          class="flex flex-col gap-1 border-b border-border px-2 pb-2 pt-1 text-xs"
        >
          <div class="flex items-center gap-2 font-medium">
            <span aria-hidden="true">🌳</span>
            <span class="min-w-0 truncate">{{ openCollapsedPopoverGroup.worktree.name }}</span>
          </div>
          <div class="break-all pl-7 text-[11px] font-normal leading-snug text-muted-foreground">
            {{ openCollapsedPopoverGroup.worktree.path }}
          </div>
          <div class="flex flex-col gap-0.5 pl-7 text-[11px] text-muted-foreground">
            <div>
              Branch:
              <span class="text-foreground">{{ openCollapsedPopoverGroup.worktree.branch }}</span>
            </div>
            <div>
              Source branch:
              <span class="text-foreground">{{
                openCollapsedPopoverGroup.worktree.baseBranch?.trim()
                  ? openCollapsedPopoverGroup.worktree.baseBranch
                  : "—"
              }}</span>
            </div>
          </div>
        </div>
        <div
          v-if="openCollapsedPopoverGroup.isStale"
          class="px-2 pt-2 pb-1.5 text-xs text-destructive"
        >
          Worktree missing
        </div>
        <div
          v-else-if="openCollapsedPopoverGroup.threads.length === 0"
          class="px-2 pt-2 pb-1.5 text-xs text-muted-foreground"
        >
          No threads in this worktree
        </div>
        <ul v-else class="space-y-0.5 pt-2">
          <li
            v-for="thread in openCollapsedPopoverGroup.threads"
            :key="thread.id"
            :data-testid="`thread-list-item-${thread.id}`"
          >
            <ThreadRow
              data-testid="thread-row"
              :thread="thread"
              :is-active="thread.id === activeThreadId"
              :run-status="runStatusByThreadId?.[thread.id] ?? null"
              :needs-attention="threadsNeedingAttention?.has(thread.id) ?? false"
              @select="handleCollapsedGroupSelect(thread.id)"
              @remove="emit('remove', thread.id)"
              @rename="(title) => emit('rename', thread.id, title)"
            />
          </li>
        </ul>
      </div>
    </Teleport>
  </aside>
</template>
