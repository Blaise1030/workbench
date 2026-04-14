<script setup lang="ts">
import type { RunStatus, Thread, Worktree } from "@shared/domain";
import type { AppUpdateAvailability } from "@shared/ipc";
import type { WorkspaceThreadContext } from "@/stores/workspaceStore";
import { Download, FileText, Plus, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BranchPicker from "@/components/BranchPicker.vue";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";
import WorktreeStaleCallout from "@/components/WorktreeStaleCallout.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Button from "@/components/ui/Button.vue";
import Switch from "@/components/ui/Switch.vue";
import { groupThreadsByRelativeDate } from "@/lib/threadDateGroups";
import type { KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const keybindings = useKeybindingsStore();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

const PRIMARY_FALLBACK_UI_KEY = "__sidebar-primary__";

/** Max threads shown before "Show more"; expanding reveals the rest and a "Show less" control. */
const THREAD_GROUP_PREVIEW_COUNT = 12;

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
    /** Thread id while the inline new-thread prompt is open (agent not finalized in UI). */
    inlinePromptThreadId?: string | null;
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
    projectId: null,
    inlinePromptThreadId: null
  }
);

const emit = defineEmits<{
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, newTitle: string];
  createWorktreeGroup: [branch: string, baseBranch: string | null];
  cancelBranchPicker: [];
  showBranchPicker: [];
  deleteWorktreeGroup: [worktreeId: string];
  collapse: [];
  expand: [];
  addThreadInline: [worktreeId: string];
}>();

const collapsedGroups = ref<Set<string>>(new Set());
const groupCollapseHistory = ref<Map<string, boolean>>(new Map());
/** When enabled, each group only lists threads created on that worktree's current branch. */
const filterByCurrentBranch = ref(false);
/** Group uiKeys whose thread list is expanded past the preview count. */
const threadListExpandedByGroupUiKey = ref<Set<string>>(new Set());
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
  // Primary row can use uiKey fallback while worktreeId is null; threads still carry worktreeId.
  if (group.isPrimary && group.threads.length > 0) {
    const fromThread = group.threads[0]?.worktreeId;
    if (fromThread) return fromThread;
  }
  return null;
}

function openNewThreadInCollapsedGroup(group: SidebarContextGroup): void {
  const id = worktreeIdForGroupAdd(group);
  if (id === null) return;
  emit("addThreadInline", id);
}

function openNewThreadInActiveWorkspace(): void {
  const id = props.defaultWorktreeId;
  if (!id) return;
  emit("addThreadInline", id);
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

function threadsForWorktreeInProps(worktreeId: string): Thread[] {
  return props.threads.filter((thread) => thread.worktreeId === worktreeId);
}

function mergeContextThreadsWithExtras(context: WorkspaceThreadContext): Thread[] {
  const canonical = context.threads;
  const canonicalIds = new Set(canonical.map((t) => t.id));
  const extras = props.threads.filter(
    (t) => t.worktreeId === context.worktreeId && !canonicalIds.has(t.id)
  );
  return [...extras, ...canonical];
}

function hasActiveThreadInWorktree(worktreeId: string): boolean {
  return props.threads.some(
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
    const fallbackGroups = props.threads
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
    ? threadsForWorktreeInProps(props.defaultWorktreeId)
    : props.threads.filter((thread) => !linkedWorktreeIds.has(thread.worktreeId));
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
    const groupThreads = threadsForWorktreeInProps(worktree.id);
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

function threadsFilteredByCurrentBranch(group: SidebarContextGroup, threads: Thread[]): Thread[] {
  if (!filterByCurrentBranch.value) return threads;
  const b = group.branch?.trim() ?? "";
  if (!b) return threads;
  return threads.filter((t) => {
    const cb = t.createdBranch?.trim() ?? "";
    return cb.length > 0 && cb === b;
  });
}

const branchFilteredContextGroups = computed<SidebarContextGroup[]>(() => {
  if (!filterByCurrentBranch.value) return contextGroups.value;
  return contextGroups.value.map((group) => ({
    ...group,
    threads: threadsFilteredByCurrentBranch(group, group.threads)
  }));
});

const branchFilterAvailable = computed(() => contextGroups.value.some((g) => Boolean(g.branch?.trim())));

const effectiveCollapsedGroups = computed(() => {
  const next = new Set(collapsedGroups.value);
  if (activeContextWorktreeId.value !== null) {
    next.delete(activeContextWorktreeId.value);
  }
  return next;
});

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

    const validKeys = new Set(groups.map((g) => g.uiKey));
    const expandedNext = new Set(threadListExpandedByGroupUiKey.value);
    let expandedChanged = false;
    for (const key of [...expandedNext]) {
      if (!validKeys.has(key)) {
        expandedNext.delete(key);
        expandedChanged = true;
      }
    }
    if (expandedChanged) {
      threadListExpandedByGroupUiKey.value = expandedNext;
    }
  },
  { immediate: true }
);

watch(
  () => [props.activeThreadId, contextGroups.value] as const,
  ([activeId, groups]) => {
    if (!activeId) return;
    for (const group of groups) {
      const idx = group.threads.findIndex((t) => t.id === activeId);
      if (idx >= THREAD_GROUP_PREVIEW_COUNT) {
        if (!threadListExpandedByGroupUiKey.value.has(group.uiKey)) {
          const next = new Set(threadListExpandedByGroupUiKey.value);
          next.add(group.uiKey);
          threadListExpandedByGroupUiKey.value = next;
        }
        return;
      }
    }
  },
  { immediate: true }
);

function isThreadListExpanded(uiKey: string): boolean {
  return threadListExpandedByGroupUiKey.value.has(uiKey);
}

function expandThreadListForGroup(uiKey: string): void {
  const next = new Set(threadListExpandedByGroupUiKey.value);
  next.add(uiKey);
  threadListExpandedByGroupUiKey.value = next;
}

function collapseThreadListForGroup(uiKey: string): void {
  const next = new Set(threadListExpandedByGroupUiKey.value);
  next.delete(uiKey);
  threadListExpandedByGroupUiKey.value = next;
}

function displayThreadsForGroup(group: SidebarContextGroup): Thread[] {
  const n = group.threads.length;
  if (n <= THREAD_GROUP_PREVIEW_COUNT) return group.threads;
  if (isThreadListExpanded(group.uiKey)) return group.threads;
  return group.threads.slice(0, THREAD_GROUP_PREVIEW_COUNT);
}

function displayThreadDateSubgroups(group: SidebarContextGroup) {
  return groupThreadsByRelativeDate(displayThreadsForGroup(group));
}

function showThreadListShowMore(group: SidebarContextGroup): boolean {
  return group.threads.length > THREAD_GROUP_PREVIEW_COUNT && !isThreadListExpanded(group.uiKey);
}

function showThreadListShowLess(group: SidebarContextGroup): boolean {
  return group.threads.length > THREAD_GROUP_PREVIEW_COUNT && isThreadListExpanded(group.uiKey);
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
    if (props.collapsed) {
      emit("expand");
    }
    emit("showBranchPicker");
  }
}

const appUpdate = ref<AppUpdateAvailability | null>(null);

onMounted(() => {
  void (async () => {
    const check = window.workspaceApi?.getAppUpdateAvailability;
    if (!check) {
      appUpdate.value = null;
      return;
    }
    try {
      appUpdate.value = await check();
    } catch {
      appUpdate.value = null;
    }
  })();
});

async function openAppUpdateUrl(url: string): Promise<void> {
  await window.workspaceApi?.openAppExternalUrl?.(url);
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
        <div class="flex flex-col items-center gap-3 text-center">
          <h3 class="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">No threads</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="w-full max-w-[12rem]"
            aria-label="Add thread"
            :title="titleWithShortcut('Add thread', 'newThreadMenu')"
            data-testid="thread-sidebar-empty-add-thread"
            @click="openNewThreadInActiveWorkspace"
          >
            <Plus class="h-4 w-4" />
            <span>Add thread</span>
          </Button>
        </div>
      </template>
    </section>
    <div v-else class="min-h-0 flex-1 overflow-y-auto pb-3 pt-3">
      <div
        v-for="(group, groupIndex) in branchFilteredContextGroups"
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
                  <span aria-hidden="true">{{ group.isPrimary ? "⭐️" : "🌳" }}</span>
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
                    <span aria-hidden="true">{{ group.isPrimary ? "⭐️" : "🌳" }}</span>
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
                  <ul v-else class="min-w-0 space-y-0.5 pt-2">
                    <template
                      v-for="(subgroup, sgIdx) in displayThreadDateSubgroups(group)"
                      :key="`${group.uiKey}-date-${sgIdx}`"
                    >
                      <li
                        role="presentation"
                        class="list-none px-2 pb-0.5 pt-2 first:pt-0"
                        :data-testid="`thread-date-subgroup-${group.uiKey}-${sgIdx}`"
                      >
                        <span
                          class="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                        >
                          {{ subgroup.label }}
                        </span>
                      </li>
                      <li
                        v-for="thread in subgroup.threads"
                        :key="thread.id"
                        class="min-w-0"
                        :data-testid="`thread-list-item-${thread.id}`"
                      >
                        <ThreadRow
                          data-testid="thread-row"
                          :thread="thread"
                          :is-active="thread.id === activeThreadId"
                          :hide-agent-icon="thread.id === inlinePromptThreadId"
                          :needs-idle-attention="Boolean(idleAttentionByThreadId?.[thread.id])"
                          :run-status="runStatusByThreadId?.[thread.id] ?? null"
                          @select="handleCollapsedGroupSelect(thread.id)"
                          @remove="emit('remove', thread.id)"
                          @rename="(title) => emit('rename', thread.id, title)"
                        />
                      </li>
                    </template>
                  </ul>
                  <div
                    v-if="showThreadListShowMore(group)"
                    class="flex justify-center px-2 pt-1 pb-0.5"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      class="w-auto shrink-0"
                      :data-testid="`thread-group-show-more-${group.uiKey}`"
                      @click="expandThreadListForGroup(group.uiKey)"
                    >
                      Show more threads
                    </Button>
                  </div>
                  <div
                    v-if="showThreadListShowLess(group)"
                    class="flex justify-center px-2 pt-1 pb-0.5"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      class="w-auto shrink-0"
                      :data-testid="`thread-group-show-less-${group.uiKey}`"
                      @click="collapseThreadListForGroup(group.uiKey)"
                    >
                      Show less
                    </Button>
                  </div>
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
            @add-thread-inline="emit('addThreadInline', $event)"
            @delete="group.worktreeId !== null && emit('deleteWorktreeGroup', group.worktreeId)"
          />

          <div
            v-if="groupIndex === 0 && branchFilterAvailable"
            class="flex items-center gap-2 py-0.5 px-5"
            title="Threads created on the checked-out branch in each group."
          >
            <Switch
              id="thread-sidebar-filter-current-branch"
              v-model="filterByCurrentBranch"
              class="shrink-0"
              data-testid="thread-sidebar-filter-current-branch"
              aria-label="Threads from this branch only"
            />
            <label
              class="min-w-0 user-select-none cursor-pointer text-left text-[11px] leading-snug text-muted-foreground"
              for="thread-sidebar-filter-current-branch"
            >
              Threads from this branch only
            </label>
          </div>

          <WorktreeStaleCallout
            v-if="!group.isPrimary && group.worktreeId !== null && group.isStale && group.threads.length > 0 && !effectiveCollapsedGroups.has(group.uiKey)"
            :branch="group.branch ?? ''"
            @delete="emit('deleteWorktreeGroup', group.worktreeId)"
          />

          <ul
            :data-testid="`thread-group-threads-${group.uiKey}`"
            v-show="!effectiveCollapsedGroups.has(group.uiKey)"
            class="min-w-0 space-y-0.5 pl-3 pr-2 pt-2"
          >
            <template
              v-for="(subgroup, sgIdx) in displayThreadDateSubgroups(group)"
              :key="`${group.uiKey}-date-${sgIdx}`"
            >
              <li
                role="presentation"
                class="list-none px-2 pb-0.5 pt-2 first:pt-0"
                :data-testid="`thread-date-subgroup-${group.uiKey}-${sgIdx}`"
              >
                <span
                  class="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {{ subgroup.label }}
                </span>
              </li>
              <li
                v-for="thread in subgroup.threads"
                :key="thread.id"
                class="min-w-0"
                :data-testid="`thread-list-item-${thread.id}`"
              >
                <ThreadRow
                  data-testid="thread-row"
                  :thread="thread"
                  :collapsed="collapsed"
                  :is-active="thread.id === activeThreadId"
                  :hide-agent-icon="thread.id === inlinePromptThreadId"
                  :needs-idle-attention="Boolean(idleAttentionByThreadId?.[thread.id])"
                  :run-status="runStatusByThreadId?.[thread.id] ?? null"
                  @select="emit('select', thread.id)"
                  @remove="emit('remove', thread.id)"
                  @rename="(title) => emit('rename', thread.id, title)"
                />
              </li>
            </template>
          </ul>
          <div
            v-if="
              showThreadListShowMore(group) && !effectiveCollapsedGroups.has(group.uiKey)
            "
            class="flex justify-center px-2 pt-1"
          >
            <Button
              type="button"
              variant="outline"
              size="xs"
              class="w-auto shrink-0"
              :data-testid="`thread-group-show-more-${group.uiKey}`"
              @click="expandThreadListForGroup(group.uiKey)"
            >
              Show more threads
            </Button>
          </div>
          <div
            v-if="
              showThreadListShowLess(group) && !effectiveCollapsedGroups.has(group.uiKey)
            "
            class="flex justify-center px-2 pt-1"
          >
            <Button
              type="button"
              variant="outline"
              size="xs"
              class="w-auto shrink-0"
              :data-testid="`thread-group-show-less-${group.uiKey}`"
              @click="collapseThreadListForGroup(group.uiKey)"
            >
              Show less
            </Button>
          </div>
        </template>
      </div>
    </div>
    <footer
      class="shrink-0 w-full p-2"
      :class="[
        'flex flex-col',
        collapsed ? 'items-stretch' : '',
        appUpdate ? 'gap-3 overflow-visible pb-2 pt-1' : 'gap-2'
      ]"
    >
      <Transition name="ticket-rise" appear>
        <div
          v-if="appUpdate && !collapsed"
          :key="appUpdate.latestVersion"
          class="update-ticket-stage relative z-10 flex w-full justify-center overflow-visible px-0.5 will-change-transform"
        >
          <div
            data-testid="thread-sidebar-update-card"
            class="update-ticket relative w-full overflow-hidden rounded-none px-2.5 pb-2.5 pt-2 text-foreground"
          >
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/[0.04] to-transparent dark:from-white/[0.06]"
              aria-hidden="true"
            />
            <header class="relative flex items-end justify-between gap-2 border-b border-dashed border-stone-800/20 pb-2 dark:border-stone-200/15">
              <div class="min-w-0">
                <p class="text-[8px] font-semibold uppercase leading-none tracking-[0.22em] text-muted-foreground">
                  Software update
                </p>
                <p class="mt-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground/90">
                  REF-{{ appUpdate.latestVersion.replace(/\./g, "") }}
                </p>
              </div>
              <p
                class="shrink-0 rounded-none border border-stone-800/15 bg-white/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums leading-none dark:border-stone-200/12 dark:bg-black/25"
              >
                RELEASE
              </p>
            </header>

            <div class="relative flex min-w-0 items-stretch gap-1.5 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Depart</p>
                <p class="mt-0.5 truncate font-mono text-[15px] font-bold leading-none tabular-nums tracking-tight">
                  v{{ appUpdate.currentVersion }}
                </p>
              </div>
              <div
                class="flex shrink-0 flex-col items-center justify-center gap-0.5 px-0.5 text-muted-foreground"
                aria-hidden="true"
              >
                <div class="ticket-route-line" />
                <span class="select-none text-base leading-none text-primary" aria-hidden="true">🚂</span>
                <div class="ticket-route-line" />
              </div>
              <div class="min-w-0 flex-1 text-right">
                <p class="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Arrive</p>
                <p class="mt-0.5 truncate font-mono text-[15px] font-bold leading-none tabular-nums tracking-tight">
                  v{{ appUpdate.latestVersion }}
                </p>
              </div>
            </div>
            <div class="ticket-perf mb-2" aria-hidden="true" />
            <div class="ticket-barcode mb-2.5" aria-hidden="true" />

            <div class="relative grid min-w-0 grid-cols-2 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="flex h-auto min-h-8 min-w-0 flex-row items-center justify-center gap-1 border-stone-800/25 bg-white/55 px-1.5 py-1.5 text-stone-900 hover:bg-white/80 dark:border-stone-200/18 dark:bg-black/30 dark:text-stone-100 dark:hover:bg-black/45"
                aria-label="View changelog"
                data-testid="thread-sidebar-update-changelog"
                @click="openAppUpdateUrl(appUpdate.compareUrl)"
              >
                <FileText class="h-3.5 w-3.5 shrink-0" />
                <span class="min-w-0 text-left text-[10px] font-semibold leading-snug">Changelog</span>
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                class="flex h-auto min-h-8 min-w-0 flex-row items-center justify-center gap-1 px-1.5 py-1.5 font-semibold"
                aria-label="Download updated version"
                data-testid="thread-sidebar-update-download"
                @click="openAppUpdateUrl(appUpdate.releasePageUrl)"
              >
                <Download class="h-3.5 w-3.5 shrink-0" />
                <span class="min-w-0 text-left text-[10px] leading-snug">Download</span>
              </Button>
            </div>
          </div>
        </div>
      </Transition>
      <Transition name="ticket-collapsed" appear>
        <Button
          v-if="appUpdate && collapsed"
          :key="`update-collapsed-${appUpdate.latestVersion}`"
          type="button"
          variant="outline"
          size="icon-xs"
          class="w-full shrink-0 border-primary/35 bg-primary/5 text-base leading-none hover:bg-primary/10"
          :aria-label="`Update available to version ${appUpdate.latestVersion}. ${titleWithShortcut('Expand threads sidebar', 'toggleThreadSidebar')}`"
          :title="titleWithShortcut('Update available — expand threads sidebar', 'toggleThreadSidebar')"
          data-testid="thread-sidebar-update-collapsed-trigger"
          @click="emit('expand')"
        >
          <span aria-hidden="true">🚂</span>
        </Button>
      </Transition>
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
        :size="collapsed ? 'icon-xs' : 'sm'"
        :class="collapsed ? 'w-full shrink-0' : 'self-center'"
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

<style scoped>
.ticket-rise-enter-active {
  transition:
    opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.52s cubic-bezier(0.22, 1, 0.36, 1);
}

.ticket-rise-enter-from {
  opacity: 0;
  transform: translate3d(0, 1.1rem, 0);
}

.ticket-rise-enter-to {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.ticket-collapsed-enter-active {
  transition:
    opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.ticket-collapsed-enter-from {
  opacity: 0;
  transform: translate3d(0, 0.45rem, 0);
}

.ticket-collapsed-enter-to {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.update-ticket {
  transform: rotate(1deg);
  transform-origin: 50% 92%;
  background: linear-gradient(
    168deg,
    hsl(43 42% 97%) 0%,
    hsl(40 35% 94%) 42%,
    hsl(38 38% 91%) 100%
  );
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.55),
    0 1px 2px rgb(28 22 12 / 0.035),
    0 4px 10px rgb(28 22 12 / 0.055),
    0 0 0 1px rgb(55 48 40 / 0.09);
}

.dark .update-ticket {
  background: linear-gradient(168deg, hsl(28 14% 14%) 0%, hsl(26 12% 11%) 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.04),
    0 1px 3px rgb(0 0 0 / 0.2),
    0 6px 14px rgb(0 0 0 / 0.22),
    0 0 0 1px rgb(255 255 255 / 0.06);
}

.ticket-perf {
  border-top: 1px dashed rgb(62 53 42 / 0.28);
}

.dark .ticket-perf {
  border-top-color: rgb(255 255 255 / 0.14);
}

.ticket-barcode {
  height: 18px;
  border-radius: 0;
  background: repeating-linear-gradient(
    90deg,
    rgb(40 36 31 / 0.32) 0px,
    rgb(40 36 31 / 0.32) 1px,
    transparent 1px,
    transparent 3px
  );
}

.dark .ticket-barcode {
  background: repeating-linear-gradient(
    90deg,
    rgb(255 255 255 / 0.16) 0px,
    rgb(255 255 255 / 0.16) 1px,
    transparent 1px,
    transparent 3px
  );
}

.ticket-route-line {
  width: 2px;
  flex: 1;
  min-height: 5px;
  max-height: 11px;
  border-radius: 1px;
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in oklch, var(--primary) 48%, transparent),
    transparent
  );
}
</style>
