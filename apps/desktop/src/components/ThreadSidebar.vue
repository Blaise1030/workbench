<script setup lang="ts">
import type { RunStatus, Thread, Worktree } from "@shared/domain";
import type { AppUpdateAvailability } from "@shared/ipc";
import type { WorkspaceThreadContext } from "@/stores/workspaceStore";
import { Download, FileText, Plus, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BranchPicker from "@/components/BranchPicker.vue";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Button from "@/components/ui/Button.vue";
import Switch from "@/components/ui/Switch.vue";
import { groupThreadsByRelativeDate } from "@/lib/threadDateGroups";
import type { KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import ThreadSidebarNodes, { type ThreadSidebarNodeData } from "@/components/ThreadSidebarNodes.vue";

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
  const id = resolvePrimaryWorktreeId();
  if (!id) return;
  emit("addThreadInline", id);
}

function resolvePrimaryWorktreeId(): string | null {
  if (props.defaultWorktreeId) return props.defaultWorktreeId;

  const primaryContextId =
    props.threadContexts?.find((context) => context.isDefault)?.worktreeId ?? null;
  if (primaryContextId) return primaryContextId;

  const primaryGroupId = contextGroups.value.find((group) => group.isPrimary)?.worktreeId ?? null;
  if (primaryGroupId) return primaryGroupId;

  return props.threads[0]?.worktreeId ?? null;
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

function showThreadListShowMore(group: SidebarContextGroup): boolean {
  return group.threads.length > THREAD_GROUP_PREVIEW_COUNT && !isThreadListExpanded(group.uiKey);
}

function showThreadListShowLess(group: SidebarContextGroup): boolean {
  return group.threads.length > THREAD_GROUP_PREVIEW_COUNT && isThreadListExpanded(group.uiKey);
}

type ContextNode = Extract<ThreadSidebarNodeData, { kind: "context" }>;

const sidebarNodes = computed<ContextNode[]>(() =>
  branchFilteredContextGroups.value.map((group) => ({
    kind: "context" as const,
    id: group.uiKey,
    addThreadTargetId: worktreeIdForGroupAdd(group),
    title: group.title,
    isWorktree: !group.isPrimary && group.worktreeId !== null,
    isPrimary: group.isPrimary,
    isStale: group.isStale,
    branch: group.branch,
    showMore: showThreadListShowMore(group),
    showLess: showThreadListShowLess(group),
    threads: displayThreadsForGroup(group).map((thread) => ({
      kind: "thread" as const,
      thread,
      isActive: thread.id === props.activeThreadId,
      runStatus: props.runStatusByThreadId?.[thread.id] ?? null,
      needsIdleAttention: Boolean(props.idleAttentionByThreadId?.[thread.id]),
      hideAgentIcon: thread.id === props.inlinePromptThreadId,
    })),
  }))
);

const expandedContexts = computed<Set<string>>(() => {
  const expanded = new Set<string>();
  for (const group of branchFilteredContextGroups.value) {
    if (!effectiveCollapsedGroups.value.has(group.uiKey)) {
      expanded.add(group.uiKey);
    }
  }
  return expanded;
});

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
    :class="collapsed ? 'hidden':''"
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
    </section>
    <div v-else class="flex min-h-0 flex-1 flex-col">      
      <div class="min-h-0 flex-1 flex flex-col overflow-y-auto pb-3 pt-3">
        <div
          v-if="branchFilterAvailable"
          class="flex items-center gap-2 px-4 py-2"
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
        <ul class="min-w-0 space-y-2 px-1.5">
          <ThreadSidebarNodes
            v-for="node in sidebarNodes"
            :key="node.id"
            :node="node"
            :expanded-contexts="expandedContexts"
            :collapsed="collapsed"
            @toggle-context="toggleGroup"
            @add-thread="emit('addThreadInline', $event)"
            @delete-context="(id) => emit('deleteWorktreeGroup', id)"
            @expand-thread-list="expandThreadListForGroup"
            @collapse-thread-list="collapseThreadListForGroup"
            @select-thread="emit('select', $event)"
            @remove-thread="emit('remove', $event)"
            @rename-thread="(id, title) => emit('rename', id, title)"
          />
        </ul>
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
        :size="collapsed ? 'icon-xs' : 'xs'"
        :class="collapsed ? 'w-full shrink-0' : 'self-center rounded-md'"
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
