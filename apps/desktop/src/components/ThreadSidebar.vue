<script setup lang="ts">
import type { RunStatus, Thread, Worktree } from "@shared/domain";
import type { WorkspaceThreadContext } from "@/stores/workspaceStore";
import { Plus, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BranchPicker from "@/components/BranchPicker.vue";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";
import WorktreeStaleCallout from "@/components/WorktreeStaleCallout.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Button from "@/components/ui/Button.vue";
import { openThreadCreateDialog } from "@/composables/threadCreateDialog";
import { titleWithShortcut } from "@/keybindings/registry";

const PRIMARY_FALLBACK_UI_KEY = "__sidebar-primary__";

type SidebarContextGroup = {
  uiKey: string;
  worktreeId: string | null;
  worktree: Worktree | null;
  title: string;
  branch: string | null;
  baseBranch: string | null;
  path: string | null;
  threads: Thread[];
  isStale: boolean;
  isPrimary: boolean;
  isActive: boolean;
};

const props = withDefaults(
  defineProps<{
    threads: Thread[];
    activeThreadId: string | null;
    /** Narrow rail: agent icons only, no titles. */
    collapsed?: boolean;
    runStatusByThreadId?: Record<string, RunStatus>;
    /** Background thread finished (PTY idle) while unfocused — highlight until opened. */
    idleAttentionByThreadId?: Record<string, boolean>;
    /** Non-default worktrees (thread groups). */
    threadGroups?: Worktree[];
    /** Store-derived grouped contexts, ordered with Primary first. */
    threadContexts?: WorkspaceThreadContext[];
    /** Active worktree label shown in the top bar when collapsed. */
    contextLabel?: string | null;
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
    idleAttentionByThreadId: undefined,
    threadGroups: () => [],
    threadContexts: undefined,
    contextLabel: null,
    defaultWorktreeId: null,
    staleWorktreeIds: () => new Set(),
    showBranchPicker: false,
    projectId: null
  }
);

const emit = defineEmits<{
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, newTitle: string];
  reorder: [payload: { worktreeId: string; orderedThreadIds: string[] }];
  createWorktreeGroup: [branch: string, baseBranch: string | null];
  cancelBranchPicker: [];
  showBranchPicker: [];
  deleteWorktreeGroup: [worktreeId: string];
  collapse: [];
  expand: [];
}>();

const collapsedGroups = ref<Set<string>>(new Set());
const groupCollapseHistory = ref<Map<string, boolean>>(new Map());
const openCollapsedGroupId = ref<string | null>(null);
const collapsedPopoverHoverCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null);

function clearCollapsedPopoverHoverTimer(): void {
  const t = collapsedPopoverHoverCloseTimer.value;
  if (t) {
    clearTimeout(t);
    collapsedPopoverHoverCloseTimer.value = null;
  }
}

function scheduleCollapsedPopoverClose(): void {
  clearCollapsedPopoverHoverTimer();
  collapsedPopoverHoverCloseTimer.value = setTimeout(() => {
    openCollapsedGroupId.value = null;
    collapsedPopoverHoverCloseTimer.value = null;
  }, 300);
}

function onCollapsedGroupTriggerPointerEnter(groupKey: string): void {
  clearCollapsedPopoverHoverTimer();
  openCollapsedGroupId.value = groupKey;
}

function onCollapsedGroupTriggerPointerLeave(): void {
  scheduleCollapsedPopoverClose();
}

function onCollapsedPopoverPointerEnter(): void {
  clearCollapsedPopoverHoverTimer();
}

function onCollapsedPopoverPointerLeave(): void {
  scheduleCollapsedPopoverClose();
}

function worktreeIdForGroupAdd(group: SidebarContextGroup): string | null {
  if (group.worktreeId !== null) return group.worktreeId;
  if (group.isPrimary && props.defaultWorktreeId) return props.defaultWorktreeId;
  return null;
}

/** Label for the new-thread dialog when adding from a specific group row or popover. */
function threadDestinationLabelForGroup(group: SidebarContextGroup): string {
  if (group.isPrimary) {
    return (props.contextLabel?.trim() || group.title).trim();
  }
  return group.title.trim();
}

function openNewThreadInCollapsedGroup(group: SidebarContextGroup): void {
  const id = worktreeIdForGroupAdd(group);
  if (id === null) return;
  openThreadCreateDialog({
    target: "worktreeGroup",
    worktreeId: id,
    destinationContextLabel: threadDestinationLabelForGroup(group)
  });
}

onBeforeUnmount(() => {
  clearCollapsedPopoverHoverTimer();
});

function toggleGroup(worktreeId: string): void {
  const next = new Set(collapsedGroups.value);
  let isCollapsed: boolean;
  if (next.has(worktreeId)) {
    next.delete(worktreeId);
    isCollapsed = false;
  } else {
    next.add(worktreeId);
    isCollapsed = true;
  }
  collapsedGroups.value = next;
  const history = new Map(groupCollapseHistory.value);
  history.set(worktreeId, isCollapsed);
  groupCollapseHistory.value = history;
}

const renderedThreads = ref<Thread[]>([...props.threads]);
const draggedThreadId = ref<string | null>(null);
const dragOverThreadId = ref<string | null>(null);
const dropCompleted = ref(false);

function renderedThreadsForWorktree(worktreeId: string): Thread[] {
  return renderedThreads.value.filter((thread) => thread.worktreeId === worktreeId);
}

function mergeContextThreadsWithExtras(context: WorkspaceThreadContext): Thread[] {
  const canonicalThreadIds = new Set(context.threads.map((thread) => thread.id));
  const visibleSameWorktreeThreads = renderedThreads.value.filter(
    (thread) => thread.worktreeId === context.worktreeId
  );
  const missingCanonicalThreads = context.threads.filter(
    (thread) => !visibleSameWorktreeThreads.some((visibleThread) => visibleThread.id === thread.id)
  );

  return [
    ...visibleSameWorktreeThreads,
    ...missingCanonicalThreads.filter((thread) => canonicalThreadIds.has(thread.id))
  ];
}

function hasActiveThreadInWorktree(worktreeId: string): boolean {
  return renderedThreads.value.some(
    (thread) => thread.id === props.activeThreadId && thread.worktreeId === worktreeId
  );
}

const contextGroups = computed<SidebarContextGroup[]>(() => {
  if (props.threadContexts?.length) {
    const contextGroups = props.threadContexts.map((context) => ({
      uiKey: context.worktreeId,
      worktreeId: context.worktreeId,
      worktree: context.worktree,
      title: context.displayLabel,
      branch: context.worktree.branch,
      baseBranch: context.worktree.baseBranch,
      path: context.worktree.path,
      threads: mergeContextThreadsWithExtras(context),
      isStale: props.staleWorktreeIds?.has(context.worktreeId) ?? false,
      isPrimary: context.isDefault,
      isActive: hasActiveThreadInWorktree(context.worktreeId)
    }));

    const coveredThreadIds = new Set(
      contextGroups.flatMap((group) => group.threads.map((thread) => thread.id))
    );
    const fallbackGroups = renderedThreads.value
      .filter((thread) => !coveredThreadIds.has(thread.id))
      .reduce<SidebarContextGroup[]>((groups, thread) => {
        const existingGroup = groups.find((group) => group.worktreeId === thread.worktreeId);
        if (existingGroup) {
          existingGroup.threads.push(thread);
          existingGroup.isActive ||= thread.id === props.activeThreadId;
          return groups;
        }

        groups.push({
          uiKey: thread.worktreeId,
          worktreeId: thread.worktreeId,
          worktree: null,
          title: thread.worktreeId === props.defaultWorktreeId ? "Primary" : thread.worktreeId,
          branch: null,
          baseBranch: null,
          path: null,
          threads: [thread],
          isStale: props.staleWorktreeIds?.has(thread.worktreeId) ?? false,
          isPrimary: thread.worktreeId === props.defaultWorktreeId,
          isActive: thread.id === props.activeThreadId
        });

        return groups;
      }, []);

    const fallbackPrimaryGroups = fallbackGroups.filter((group) => group.isPrimary);
    const fallbackLinkedGroups = fallbackGroups.filter((group) => !group.isPrimary);

    return [...fallbackPrimaryGroups, ...contextGroups, ...fallbackLinkedGroups];
  }

  const linkedWorktreeIds = new Set((props.threadGroups ?? []).map((group) => group.id));
  const primaryThreads = props.defaultWorktreeId
    ? renderedThreadsForWorktree(props.defaultWorktreeId)
    : renderedThreads.value.filter((thread) => !linkedWorktreeIds.has(thread.worktreeId));
  const groups: SidebarContextGroup[] = [];

  if (
    props.defaultWorktreeId !== null ||
    primaryThreads.length > 0 ||
    (props.threadGroups?.length ?? 0) === 0
  ) {
    groups.push({
      uiKey: props.defaultWorktreeId ?? PRIMARY_FALLBACK_UI_KEY,
      worktreeId: props.defaultWorktreeId,
      worktree: null,
      title: "Primary",
      branch: null,
      baseBranch: null,
      path: null,
      threads: primaryThreads,
      isStale: false,
      isPrimary: true,
      isActive: primaryThreads.some((thread) => thread.id === props.activeThreadId)
    });
  }

  for (const worktree of props.threadGroups ?? []) {
    const groupThreads = renderedThreadsForWorktree(worktree.id);
    groups.push({
      uiKey: worktree.id,
      worktreeId: worktree.id,
      worktree,
      title: worktree.name,
      branch: worktree.branch,
      baseBranch: worktree.baseBranch,
      path: worktree.path,
      threads: groupThreads,
      isStale: props.staleWorktreeIds?.has(worktree.id) ?? false,
      isPrimary: false,
      isActive: groupThreads.some((thread) => thread.id === props.activeThreadId)
    });
  }

  return groups;
});

const activeContextWorktreeId = computed(
  () => contextGroups.value.find((group) => group.isActive)?.uiKey ?? null
);

const effectiveCollapsedGroups = computed(() => {
  const next = new Set(collapsedGroups.value);
  if (activeContextWorktreeId.value !== null) {
    next.delete(activeContextWorktreeId.value);
  }
  return next;
});

function getThreadIds(threads: Thread[]): string[] {
  return threads.map((thread) => thread.id);
}

/** Flat sidebar order restricted to one worktree (persisted order is per worktree). */
function orderedThreadIdsForWorktree(worktreeId: string): string[] {
  return renderedThreads.value
    .filter((thread) => thread.worktreeId === worktreeId)
    .map((thread) => thread.id);
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

watch(
  () => props.collapsed,
  (collapsed) => {
    if (!collapsed) {
      openCollapsedGroupId.value = null;
    }
  }
);

watch(
  contextGroups,
  (groups) => {
    const next = new Set<string>();

    for (const group of groups) {
      if (groupCollapseHistory.value.has(group.uiKey)) {
        if (groupCollapseHistory.value.get(group.uiKey) === true) {
          next.add(group.uiKey);
        }
        continue;
      }

      if (!group.isActive && (props.activeThreadId ? true : !group.isPrimary)) {
        next.add(group.uiKey);
      }
    }

    collapsedGroups.value = next;

    if (
      openCollapsedGroupId.value !== null &&
      !groups.some((group) => group.uiKey === openCollapsedGroupId.value)
    ) {
      openCollapsedGroupId.value = null;
    }
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
  const draggedId = draggedThreadId.value;
  if (!draggedId) return;

  const worktreeId = renderedThreads.value.find((t) => t.id === draggedId)?.worktreeId ?? null;

  if (hasVisibleOrderChanged() && worktreeId !== null) {
    emit("reorder", {
      worktreeId,
      orderedThreadIds: orderedThreadIdsForWorktree(worktreeId)
    });
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

  const worktreeId = renderedThreads.value.find((t) => t.id === threadId)?.worktreeId ?? null;
  if (worktreeId === null) return;

  emit("reorder", {
    worktreeId,
    orderedThreadIds: orderedThreadIdsForWorktree(worktreeId)
  });
}

function handleCollapsedGroupSelect(threadId: string): void {
  openCollapsedGroupId.value = null;
  emit("select", threadId);
}

function setCollapsedGroupPopoverOpen(worktreeId: string, open: boolean): void {
  clearCollapsedPopoverHoverTimer();
  openCollapsedGroupId.value = open ? worktreeId : openCollapsedGroupId.value === worktreeId ? null : openCollapsedGroupId.value;
}

function onFooterWorktreeToggle(): void {
  if (props.showBranchPicker) {
    emit("cancelBranchPicker");
  } else {
    emit("showBranchPicker");
  }
}
</script>

<template>
  <aside
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    :data-thread-sidebar-collapsed="collapsed ? 'true' : undefined"
  >
    <ThreadTopBar
      :collapsed="collapsed"
      :context-label="contextLabel"
      @collapse="emit('collapse')"
      @expand="emit('expand')"
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
      <div
        v-for="(group, groupIndex) in contextGroups"
        :key="group.uiKey"
        :data-testid="`thread-group-section-${group.uiKey}`"
        :class="groupIndex > 0 ? 'mt-2' : ''"
      >
        <template v-if="collapsed">
          <div class="px-2">
            <Popover
              :open="openCollapsedGroupId === group.uiKey"
              @update:open="setCollapsedGroupPopoverOpen(group.uiKey, $event)"
            >
              <PopoverTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="thread-group-collapsed-trigger"
                  class="flex h-7 w-full items-center justify-center rounded-sm text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  :class="[
                    group.threads.some((t) => t.id === activeThreadId)
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    group.isStale ? 'text-destructive/80' : ''
                  ]"
                  :aria-label="group.isPrimary ? `Context ${group.title}` : `Worktree ${group.title}`"
                  :aria-expanded="openCollapsedGroupId === group.uiKey"
                  @pointerenter="onCollapsedGroupTriggerPointerEnter(group.uiKey)"
                  @pointerleave="onCollapsedGroupTriggerPointerLeave"
                >
                  <span aria-hidden="true">{{ group.isPrimary ? "⛰️" : "🌳" }}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                data-testid="thread-group-collapsed-popover"
                side="right"
                align="start"
                :side-offset="4"
                class="flex max-h-[min(28rem,calc(100vh-4rem))] w-[min(18rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
                @pointerenter="onCollapsedPopoverPointerEnter"
                @pointerleave="onCollapsedPopoverPointerLeave"
              >
                <div class="flex shrink-0 flex-col gap-1 border-b border-border px-2 py-2 text-xs">
                  <div class="flex items-center gap-2 font-medium">
                    <span aria-hidden="true">{{ group.isPrimary ? "⛰️" : "🌳" }}</span>
                    <span class="min-w-0 truncate">{{ group.title }}</span>
                  </div>
                  <div
                    v-if="group.path"
                    class="break-all pl-7 text-[11px] font-normal leading-snug text-muted-foreground"
                  >
                    {{ group.path }}
                  </div>
                  <div
                    v-if="group.branch || group.baseBranch"
                    class="flex flex-col gap-0.5 pl-7 text-[11px] text-muted-foreground"
                  >
                    <div>
                      Branch:
                      <span class="text-foreground">{{ group.branch }}</span>
                    </div>
                    <div>
                      Source branch:
                      <span class="text-foreground">{{ group.baseBranch?.trim() ? group.baseBranch : "—" }}</span>
                    </div>
                  </div>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto px-1.5">
                  <div
                    v-if="group.isStale"
                    class="px-2 pt-2 pb-1.5 text-xs text-destructive"
                  >
                    Worktree missing
                  </div>
                  <div
                    v-else-if="group.threads.length === 0"
                    class="px-2 pt-2 pb-1.5 text-xs text-muted-foreground"
                  >
                    No threads in this context
                  </div>
                  <ul v-else class="space-y-0.5 pt-2">
                    <li
                      v-for="thread in group.threads"
                      :key="thread.id"
                      :data-testid="`thread-list-item-${thread.id}`"
                      @dragenter.prevent="handleDragEnter(thread.id)"
                      @dragover="handleDragOver"
                      @drop="handleDrop(thread.id, $event)"
                    >
                      <ThreadRow
                        data-testid="thread-row"
                        :thread="thread"
                        :is-active="thread.id === activeThreadId"
                        :needs-idle-attention="Boolean(idleAttentionByThreadId?.[thread.id])"
                        :run-status="runStatusByThreadId?.[thread.id] ?? null"
                        :is-dragging="thread.id === draggedThreadId"
                        :is-drag-target="draggedThreadId !== null && thread.id === dragOverThreadId"
                        @dragstart="handleDragStart(thread.id, $event)"
                        @dragend="handleDragEnd"
                        @keyboard-reorder="handleKeyboardReorder(thread.id, $event)"
                        @select="handleCollapsedGroupSelect(thread.id)"
                        @remove="emit('remove', thread.id)"
                        @rename="(title) => emit('rename', thread.id, title)"
                      />
                    </li>
                  </ul>
                </div>
                <div
                  v-if="worktreeIdForGroupAdd(group) !== null && !group.isStale"
                  class="shrink-0 border-t border-border px-2 py-2 mt-2"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="w-full"
                    aria-label="Add thread to group"
                    :title="titleWithShortcut('Add thread to group', 'newThreadMenu')"
                    @click="openNewThreadInCollapsedGroup(group)"
                  >
                    <Plus class="h-4 w-4" />
                    <span>Add thread</span>
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </template>
        <template v-else>
          <ThreadGroupHeader
            :data-thread-group-id="group.worktreeId ?? undefined"
            :title="group.title"
            :context-badge-label="
              group.isPrimary
                ? group.isActive
                  ? (contextLabel ?? group.title)
                  : group.title
                : null
            "
            :branch="group.branch"
            :base-branch="group.baseBranch"
            :path="group.path"
            :thread-count="group.threads.length"
            :is-stale="group.isStale"
            :is-active="group.isActive"
            :collapsed="effectiveCollapsedGroups.has(group.uiKey)"
            :is-primary="group.isPrimary"
            :show-actions="!group.isPrimary"
            @toggle="toggleGroup(group.uiKey)"
            :worktree-id-for-create="worktreeIdForGroupAdd(group)"
            @delete="group.worktreeId !== null && emit('deleteWorktreeGroup', group.worktreeId)"
          />

          <WorktreeStaleCallout
            v-if="!group.isPrimary && group.worktreeId !== null && group.isStale && group.threads.length > 0 && !effectiveCollapsedGroups.has(group.uiKey)"
            :branch="group.branch ?? ''"
            @delete="emit('deleteWorktreeGroup', group.worktreeId)"
          />

          <ul
            :data-testid="`thread-group-threads-${group.uiKey}`"
            v-show="!effectiveCollapsedGroups.has(group.uiKey)"
            class="space-y-0.5 px-2 pt-2"
            :class="'pl-3'"
          >
            <li
              v-for="thread in group.threads"
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
                :needs-idle-attention="Boolean(idleAttentionByThreadId?.[thread.id])"
                :run-status="runStatusByThreadId?.[thread.id] ?? null"
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
      class="shrink-0 w-full border-t border-border p-2"
      :class="collapsed ? 'flex flex-col items-stretch gap-2' : 'flex flex-col gap-2'"
    >
      <BranchPicker
        v-if="showBranchPicker && projectId"
        variant="footer"
        :project-id="projectId"
        @create="(branch, baseBranch) => emit('createWorktreeGroup', branch, baseBranch)"
        @cancel="emit('cancelBranchPicker')"
      />
      <Button
        type="button"
        variant="outline"
        :size="collapsed ? 'icon-xs' : 'lg'"
        :class="collapsed ? 'w-full shrink-0' : 'w-full'"
        :aria-label="showBranchPicker ? 'Cancel add worktree' : 'Add worktree'"
        :title="showBranchPicker ? 'Close worktree form' : 'Add a linked worktree'"
        :disabled="!projectId && !showBranchPicker"
        data-testid="thread-sidebar-footer-worktree-toggle"
        @click="onFooterWorktreeToggle"
      >
        <template v-if="collapsed">
          <X v-if="showBranchPicker" class="h-4 w-4" />
          <Plus v-else class="h-4 w-4" />
        </template>
        <template v-else>
          <Plus v-if="!showBranchPicker" class="h-5 w-5 shrink-0" />
          <span class="whitespace-nowrap">{{ showBranchPicker ? "Cancel" : "Add worktree" }}</span>
        </template>
      </Button>
    </footer>
  </aside>
</template>
