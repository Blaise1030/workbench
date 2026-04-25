<script setup lang="ts">
import type { Project, RunStatus, Thread, Worktree } from "@shared/domain";
import type { AppUpdateAvailability } from "@shared/ipc";
import type { WorkspaceThreadContext } from "@/stores/workspaceStore";
import { Download, FileText, PanelLeftClose, Plus, Settings, Terminal, X } from "lucide-vue-next";
import type { CSSProperties } from "vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BranchPicker from "@/components/BranchPicker.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import ContextQueueReviewDropdown from "@/components/contextQueue/ContextQueueReviewDropdown.vue";
import { useIsFullscreen } from "@/composables/useIsFullscreen";
import ThreadRow from "@/components/ThreadRow.vue";
import ScmBranchCombobox from "@/components/ScmBranchCombobox.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge/index";
import {Button} from "@/components/ui/button";;
import PillTabs, { type PillTabItem } from "@/components/ui/pill-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import type { QueueItem } from "@/contextQueue/types";
import type { KeybindingId } from "@/keybindings/registry";
import { shortcutForModDigitSlot } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import ThreadSidebarNodes, { type ThreadSidebarNodeData } from "@/components/ThreadSidebarNodes.vue";

const keybindings = useKeybindingsStore();
const { isFullscreen } = useIsFullscreen();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

const FEEDBACK_ISSUES_URL = "https://github.com/Blaise1030/instrumental/issues/new";

async function openFeedbackIssue(): Promise<void> {
  await window.workspaceApi?.openAppExternalUrl?.(FEEDBACK_ISSUES_URL);
}

const SIDEBAR_ADD_VALUE = "__add__";
const SIDEBAR_REMOVE_VALUE = "__remove__";

const updatePopupOpen = ref(false);
const releaseTag = ref<string | null>(null);
const sidebarRootRef = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);
const updateTriggerRef = ref<HTMLElement | null>(null);
const updatePopupStyle = ref<CSSProperties>({});

function dismissUpdate(): void {
  updatePopupOpen.value = false;
}

function openUpdatePopup(): void {
  updatePopupOpen.value = true;
}

function updateSidebarPopupPosition(): void {
  const footer = footerRef.value;
  const trigger = updateTriggerRef.value;
  if (!footer || !trigger) {
    updatePopupStyle.value = {};
    return;
  }

  const footerRect = footer.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const popupWidth = Math.min(256, Math.floor(footerRect.width));
  const triggerLeft = triggerRect.left - footerRect.left;
  const clampedLeft = Math.min(Math.max(triggerLeft, 0), Math.max(footerRect.width - popupWidth, 0));

  updatePopupStyle.value = {
    width: `${popupWidth}px`,
    left: `${clampedLeft - triggerLeft}px`
  };
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
    /** Workspace toolbar (moved from main column): Git branch combobox vs context badge. */
    showToolbarBranchSwitcher?: boolean;
    scmBranchLine?: string | null;
    scmCurrentBranch?: string;
    scmCwd?: string;
    centerPanelTabs?: PillTabItem[];
    contextQueueItems?: QueueItem[];
    contextQueueWorktreePath?: string | null;
    /** Workspace project tabs (moved from main column header). */
    projects?: Project[];
    projectTabWorktrees?: Worktree[];
    /** All workspace threads — for project tab attention chrome. */
    projectTabThreads?: readonly Thread[];
    activeProjectId?: string | null;
    /** Footer control to open the stacked terminal overlay (replaces the floating workspace button). */
    showTerminalSidebarButton?: boolean;
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
    inlinePromptThreadId: null,
    showToolbarBranchSwitcher: false,
    scmBranchLine: null,
    scmCurrentBranch: "",
    scmCwd: "",
    centerPanelTabs: () => [],
    contextQueueItems: () => [],
    contextQueueWorktreePath: null,
    projects: () => [],
    projectTabWorktrees: () => [],
    projectTabThreads: () => [],
    activeProjectId: null,
    showTerminalSidebarButton: true
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
  branchChanged: [];
  contextQueueConfirm: [items: QueueItem[]];
  contextQueuePersistDraft: [items: QueueItem[]];
  selectProject: [projectId: string];
  removeProject: [projectId: string];
  createProject: [];
  configureCommands: [];
  openTerminalPanel: [];
}>();

const centerPanelTab = defineModel<string>("centerPanelTab", { required: true });

const activeProject = computed(
  () => props.projects.find((p) => p.id === props.activeProjectId) ?? props.projects[0] ?? null
);

function projectThreads(projectId: string): readonly Thread[] {
  return props.projectTabThreads.filter((thread) => thread.projectId === projectId);
}

function projectAttentionLevel(projectId: string): "failed" | "review" | "idle" | null {
  let hasIdle = false;
  for (const thread of projectThreads(projectId)) {
    if (props.idleAttentionByThreadId?.[thread.id]) hasIdle = true;
    const rs = props.runStatusByThreadId?.[thread.id];
    if (rs === "failed") return "failed";
    if (rs === "needsReview") return "review";
  }
  if (hasIdle) return "idle";
  return null;
}

function projectAttentionTabClass(projectId: string): string {
  const level = projectAttentionLevel(projectId);
  if (!level) return "";
  const attentionBackground = "bg-blue-500/12 dark:bg-blue-400/18";
  switch (level) {
    case "failed":
      return `${attentionBackground} ring-1 ring-red-500/55 ring-inset dark:ring-red-400/45`;
    case "review":
      return `${attentionBackground} ring-1 ring-orange-500/55 ring-inset dark:ring-orange-400/45`;
    case "idle":
      return `${attentionBackground} ring-1 ring-blue-500/55 ring-inset dark:ring-blue-400/45`;
    default:
      return "";
  }
}

function projectTabTitle(projectName: string, index: number): string {
  const hint = shortcutForModDigitSlot(index);
  return hint ? `${projectName} (${hint})` : projectName;
}

function tabButtonTitle(projectName: string, projectId: string, projectIndex: number): string {
  const level = projectAttentionLevel(projectId);
  const base = projectTabTitle(projectName, projectIndex);
  if (!level) return base;
  const hint =
    level === "failed"
      ? "Action needed (failed run)"
      : level === "review"
        ? "Needs your review"
        : "Needs attention (agent idle)";
  return `${base} — ${hint}`;
}

function onProjectFooterSelectValue(v: unknown): void {
  const s = String(v ?? "");
  if (s === SIDEBAR_ADD_VALUE) {
    emit("createProject");
    return;
  }
  if (s === SIDEBAR_REMOVE_VALUE) {
    if (activeProject.value && props.projects.length > 1) {
      emit("removeProject", activeProject.value.id);
    }
    return;
  }
  if (s) emit("selectProject", s);
}

watch(updatePopupOpen, async (isOpen) => {
  if (!isOpen) {
    updatePopupStyle.value = {};
    return;
  }
  await nextTick();
  updateSidebarPopupPosition();
});

const contextQueueReviewRef = ref<InstanceType<typeof ContextQueueReviewDropdown> | null>(null);

function openContextQueueReview(): void {
  contextQueueReviewRef.value?.openReview();
}

defineExpose({ openContextQueueReview });

const collapsedGroups = ref<Set<string>>(new Set());
const groupCollapseHistory = ref<Map<string, boolean>>(new Map());
/** Tracks which context group keys existed on the last `contextGroups` sync (for restore + new-group defaults). */
const prevContextGroupKeys = ref<Set<string>>(new Set());
/** When enabled, each group only lists threads created on that worktree's current branch. */
const filterByCurrentBranch = ref(false);
/** Group uiKeys whose thread list is expanded past the preview count. */
const threadListExpandedByGroupUiKey = ref<Set<string>>(new Set());
const openCollapsedGroupId = ref<string | null>(null);
let collapsedPopoverHoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

function clearCollapsedPopoverHoverTimer(): void {
  const t = collapsedPopoverHoverCloseTimer;
  if (t) {
    clearTimeout(t);
    collapsedPopoverHoverCloseTimer = null;
  }
}

function scheduleCollapsedPopoverClose(): void {
  clearCollapsedPopoverHoverTimer();
  collapsedPopoverHoverCloseTimer = setTimeout(() => {
    openCollapsedGroupId.value = null;
    collapsedPopoverHoverCloseTimer = null;
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
  window.removeEventListener("resize", updateSidebarPopupPosition);
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
    const validKeys = new Set(groups.map((g) => g.uiKey));
    const previous = prevContextGroupKeys.value;

    let nextCollapsed = new Set([...collapsedGroups.value].filter((k) => validKeys.has(k)));

    for (const key of validKeys) {
      if (!previous.has(key)) {
        const hist = groupCollapseHistory.value.get(key);
        if (hist === true) {
          nextCollapsed.add(key);
        } else if (hist === false) {
          nextCollapsed.delete(key);
        }
      }
    }

    collapsedGroups.value = nextCollapsed;
    prevContextGroupKeys.value = validKeys;

    if (
      openCollapsedGroupId.value !== null &&
      !groups.some((group) => group.uiKey === openCollapsedGroupId.value)
    ) {
      openCollapsedGroupId.value = null;
    }

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

const primarySidebarNodes = computed<ContextNode[]>(() =>
  sidebarNodes.value.filter((node) => !node.isWorktree)
);

const worktreeSidebarNodes = computed<ContextNode[]>(() =>
  sidebarNodes.value.filter((node) => node.isWorktree)
);

const hasActiveWorktreeThread = computed(() =>
  worktreeSidebarNodes.value.some((n) => n.threads.some((t) => t.isActive))
);

const expandedContexts = computed<Set<string>>(() => {
  const expanded = new Set<string>();
  for (const group of branchFilteredContextGroups.value) {
    if (!collapsedGroups.value.has(group.uiKey)) {
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

function handleBranchPickerOpenChange(open: boolean): void {
  if (open) {
    if (props.collapsed) {
      emit("expand");
    }
    if (!props.showBranchPicker) {
      emit("showBranchPicker");
    }
    return;
  }

  if (props.showBranchPicker) {
    emit("cancelBranchPicker");
  }
}

const appUpdate = ref<AppUpdateAvailability | null>(null);

onMounted(() => {
  window.addEventListener("resize", updateSidebarPopupPosition);

  void (async () => {
    try {
      releaseTag.value = (await window.workspaceApi?.getAppReleaseTag?.()) ?? null;
    } catch {
      releaseTag.value = null;
    }
  })();

  void (async () => {
    if (import.meta.env.DEV) {
      appUpdate.value = { currentVersion: "0.0.1", latestVersion: "0.0.2", compareUrl: "#", releasePageUrl: "#" };
      updatePopupOpen.value = true;
    }

    const check = window.workspaceApi?.getAppUpdateAvailability;
    if (!check) return;
    try {
      const result = await check();
      if (result) {
        appUpdate.value = result;
        updatePopupOpen.value = true;
      }
    } catch {
      // ignore
    }
  })();
});

async function openAppUpdateUrl(url: string): Promise<void> {
  await window.workspaceApi?.openAppExternalUrl?.(url);
}
</script>

<template>
  <aside
    ref="sidebarRootRef"
    class="flex h-full min-h-0 min-w-0 transition-[width] duration-1000 flex-col overflow-hidden"
    :class="collapsed ? 'w-0':''"
    :data-thread-sidebar-collapsed="collapsed ? 'true' : undefined"
  > 
    <!-- Header row: project selector + collapse button -->
    <div v-if="!collapsed" class="flex shrink-0 select-none items-center gap-1 px-3 pt-2">
      <Select
        v-if="projects.length > 0"
        :model-value="activeProjectId ?? undefined"
        @update:model-value="onProjectFooterSelectValue"
      >      
        <SelectTrigger
          data-testid="project-switcher-trigger"
          size="sm"
          class="flex-1 max-h-7 h-7 bg-background"
          :class="{ 'ms-19': !isFullscreen, 'max-w-[145px]': !isFullscreen }"
          :aria-label="`Active project: ${activeProject?.name ?? 'None'}`"
          :title="activeProject?.repoPath ?? undefined"
        >
          <span class="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span class="shrink-0 text-sm leading-none" aria-hidden="true">📁</span>
            <SelectValue class="truncate text-xs font-medium" :placeholder="'Project'" />
          </span>
        </SelectTrigger>
        <SelectContent class="max-h-72">
          <SelectItem
            v-for="(project, projectIndex) in projects"
            :key="project.id"
            :value="project.id"
            :title="tabButtonTitle(project.name, project.id, projectIndex)"
            :class="['text-xs', projectAttentionTabClass(project.id)]"
            :data-testid="`project-menu-item-${project.id}`"
          >
            {{ project.name }}
          </SelectItem>
          <template v-if="activeProject && projects.length > 1">
            <SelectSeparator />
            <SelectItem
              :value="SIDEBAR_REMOVE_VALUE"
              class="text-xs text-destructive focus:text-destructive"
              data-testid="project-menu-remove-current"
            >
              Remove "{{ activeProject.name }}"…
            </SelectItem>
          </template>
          <SelectSeparator />
          <SelectItem :value="SIDEBAR_ADD_VALUE" class="text-xs" data-testid="project-menu-add">
            <span class="inline-flex items-center gap-1.5">
              <Plus class="h-3.5 w-3.5" :stroke-width="1.75" />
              Add project
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <div v-else class="flex-1" :class="{ 'ms-12': !isFullscreen, 'max-w-[145px]': !isFullscreen }" />
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Collapse threads sidebar"
        :title="titleWithShortcut('Collapse threads sidebar', 'toggleThreadSidebar')"
        data-testid="thread-sidebar-toggle"
        @click="emit('collapse')"
      >
        <PanelLeftClose class="size-4" />
      </Button>
    </div>
    <div
      v-if="!collapsed && projects.length > 0"
      class="flex w-full min-w-0 flex-col gap-1 pb-1.5"
    >
      <div class="flex w-full min-w-0 flex-col gap-1">
        <ContextQueueReviewDropdown
          v-if="activeThreadId && contextQueueItems.length > 0"
          ref="contextQueueReviewRef"
          :thread-id="activeThreadId"
          :items="contextQueueItems"
          :worktree-path="contextQueueWorktreePath"
          @confirm="emit('contextQueueConfirm', $event)"
          @persist-draft="emit('contextQueuePersistDraft', $event)"
        />
      </div>
    </div>
    <section
      v-if="threads.length === 0"
      class="flex min-h-0 flex-1 flex-col pt-6 pb-2"
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
      <div class="min-h-0 relative flex-1 flex flex-col overflow-y-auto">        
        <div class="sticky top-0 z-10 h-3 w-full shrink-0 bg-gradient-to-b from-transparent to-transparent pointer-events-none" />
        <ul class="min-w-0 space-y-2 px-1.5 pb-1">
          <ThreadSidebarNodes
            v-for="node in primarySidebarNodes"
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
          >
            <template
              v-if="node.kind === 'context' && (node.isPrimary || node.threads.some(t => t.isActive))"
              #header-extra
            >
              <div class="flex flex-col gap-2 px-1 py-1">
                <template v-if="node.isPrimary">
                  <div v-if="!hasActiveWorktreeThread" class="flex min-w-0 items-start">
                    <ScmBranchCombobox
                      v-if="showToolbarBranchSwitcher"
                      variant="toolbar"
                      :branch-line="scmBranchLine"
                      :current-branch="scmCurrentBranch"
                      :project-id="projectId ?? ''"
                      :cwd="scmCwd"
                      switcher-enabled
                      @branch-changed="emit('branchChanged')"
                    />
                    <Badge
                      v-else-if="contextLabel"
                      variant="outline"
                      class="shrink-0 text-[10px] text-muted-foreground"
                    >
                      {{ contextLabel }}
                    </Badge>
                  </div>
                  <div
                    v-if="branchFilterAvailable"
                    class="flex items-center gap-2 px-2"
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
                </template>
                <div v-if="node.threads.some(t => t.isActive)" class="w-full pt-1">
                  <PillTabs
                    v-model="centerPanelTab"
                    variant="segmented"
                    :tabs="centerPanelTabs"
                    aria-label="Center panel"
                  />
                </div>
              </div>
            </template>
          </ThreadSidebarNodes>
          <li
            v-if="projectId && !collapsed"
            class="py-1"
            data-testid="thread-sidebar-worktree-insert"
          >
            <div class="flex items-center gap-2">
              <div class="h-px flex-1 bg-border/80" />
              <Popover :open="showBranchPicker" @update:open="handleBranchPickerOpenChange">
                <PopoverTrigger as-child>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    class="rounded-md"
                    aria-label="Add worktree"
                    title="Add a linked worktree"
                    :disabled="!projectId"
                    data-testid="thread-sidebar-footer-worktree-toggle"
                  >
                    <Plus class="h-5 w-5 shrink-0" />
                    <span class="whitespace-nowrap">Add worktree</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="center"
                  side="bottom"
                  class="p-2 max-w-[240px]"
                  data-testid="thread-sidebar-worktree-popover"
                >
                  <BranchPicker
                    v-if="projectId"
                    variant="popover"
                    :project-id="projectId"
                    @create="(branch, baseBranch) => emit('createWorktreeGroup', branch, baseBranch)"
                    @cancel="emit('cancelBranchPicker')"
                  />
                </PopoverContent>
              </Popover>
              <div class="h-px flex-1 bg-border/80" />
            </div>
          </li>
          <ThreadSidebarNodes
            v-for="node in worktreeSidebarNodes"
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
          >
            <template v-if="node.threads.some(t => t.isActive)" #header-extra>
              <div class="px-1 pt-1">
                <PillTabs
                  v-model="centerPanelTab"
                  variant="segmented"
                  :tabs="centerPanelTabs"
                  aria-label="Center panel"
                />
              </div>
            </template>
          </ThreadSidebarNodes>
        </ul>
        <div class="sticky bottom-0 z-10 h-5 w-full shrink-0 bg-gradient-to-t from-transparent to-transparent pointer-events-none" />
      </div>
    </div>
    <footer
      ref="footerRef"
      class="shrink-0 w-full px-2 py-1"
      :class="['flex flex-col']"
    >      
      <div class="flex w-full justify-end items-center gap-2">
      <div
        v-if="projects.length > 0"
        class="flex min-w-0 flex-col gap-2"
      >
        <div class="flex w-full min-w-0 flex-wrap items-center justify-center gap-1">
          <span
            v-if="releaseTag && !appUpdate"
            class="rounded-md border border-border/70 bg-muted/35 px-2 py-1 text-[10px] font-medium leading-none text-muted-foreground"
            data-testid="thread-sidebar-footer-release-tag"
          >
            {{ releaseTag }}
          </span>
        </div>
        </div>
        <div
          v-if="appUpdate"
          ref="updateTriggerRef"
          class="relative inline-flex shrink-0 -ms-3"
        >
          <Button
            type="button"
            variant="default"
            size="sm"
            class="shrink-0 !rounded-full"
            aria-label="Software update available"
            data-testid="project-tabs-update-trigger"
            @click="openUpdatePopup"
          >
            <span class="whitespace-nowrap">Update</span>
          </Button>

          <Transition name="ticket-popup">
            <div
              v-if="updatePopupOpen"
              :key="appUpdate.latestVersion"
              class="absolute bottom-full left-0 z-[9999] mb-2 w-64"
              :style="updatePopupStyle"
              data-testid="project-tabs-update-popup"
            >
              <div class="update-ticket relative overflow-hidden rounded-none px-2.5 pb-2.5 pt-2 text-foreground">
                <div
                  class="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/[0.04] to-transparent dark:from-white/[0.06]"
                  aria-hidden="true"
                />
                <header
                  class="relative flex items-end justify-between gap-2 border-b border-dashed border-stone-800/20 pb-2 dark:border-stone-200/15"
                >
                  <div class="min-w-0">
                    <p
                      class="text-[8px] font-semibold uppercase leading-none tracking-[0.22em] text-muted-foreground"
                    >
                      Software update
                    </p>
                    <p class="mt-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground/90">
                      REF-{{ appUpdate.latestVersion.replace(/\./g, "") }}
                    </p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <p
                      class="shrink-0 rounded-none border border-stone-800/15 bg-white/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums leading-none dark:border-stone-200/12 dark:bg-black/25"
                    >
                      RELEASE
                    </p>
                    <button
                      type="button"
                      class="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label="Dismiss update notification"
                      data-testid="project-tabs-update-dismiss"
                      @click="dismissUpdate"
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </div>
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
                    size="xs"
                    class="flex h-auto min-h-8 min-w-0 flex-row items-center justify-center gap-1 border-stone-800/25 bg-white/55 px-1.5 py-1.5 text-stone-900 hover:bg-white/80 dark:border-stone-200/18 dark:bg-black/30 dark:text-stone-100 dark:hover:bg-black/45"
                    aria-label="View changelog"
                    data-testid="project-tabs-update-changelog"
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
                    data-testid="project-tabs-update-download"
                    @click="openAppUpdateUrl(appUpdate.releasePageUrl)"
                  >
                    <Download class="h-3.5 w-3.5 shrink-0" />
                    <span class="min-w-0 text-left text-[10px] leading-snug">Download</span>
                  </Button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Raise feedback"
          title="Raise an issue on GitHub"
          data-testid="workspace-feedback-button"
          @click="openFeedbackIssue"
          class="text-sm"
        >
          <span aria-hidden="true">💬</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Settings"
          :title="titleWithShortcut('Settings', 'openSettings')"
          @click="emit('configureCommands')"
        >
          <Settings class="size-[18px]" :stroke-width="1.9" />
        </Button>
        <ThemeToggle
            variant="ghost"
            size="icon-xs"            
        /> 
        <div class="flex-1"/>       
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              class="shrink-0"
              :aria-label="titleWithShortcut('Show lower terminals', 'toggleTerminalPanel')"
              data-testid="thread-sidebar-footer-terminal"
              @click="emit('openTerminalPanel')"
            >
              <Terminal class="size-3" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {{ titleWithShortcut("Show lower terminals", "toggleTerminalPanel") }}
          </TooltipContent>
        </Tooltip>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.ticket-popup-enter-active {
  transition:
    opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.ticket-popup-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.18s ease;
}

.ticket-popup-enter-from {
  opacity: 0;
  transform: translate3d(0, -0.5rem, 0);
}

.ticket-popup-leave-to {
  opacity: 0;
  transform: translate3d(0, -0.4rem, 0);
}

.update-ticket {
  transform: rotate(1deg);
  transform-origin: 50% 8%;
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
