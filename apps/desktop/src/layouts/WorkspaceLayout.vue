<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from "vue";
import { ChevronDown, ChevronUp, Plus, Settings } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import SourceControlPanel from "@/components/SourceControlPanel.vue";
import PreviewPanel from "@/components/PreviewPanel.vue";
import ScmBranchCombobox from "@/components/ScmBranchCombobox.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import ProjectTabs from "@/components/ProjectTabs.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import AgentCommandsSettingsDialog from "@/components/AgentCommandsSettingsDialog.vue";
import FileSearchEditor from "@/components/FileSearchEditor.vue";
import WorkspaceLauncherModal from "@/components/WorkspaceLauncherModal.vue";
import ThreadInlinePromptEditor from "@/components/ThreadInlinePromptEditor.vue";
import BranchPicker from "@/components/BranchPicker.vue";
import ContextQueueReviewDropdown from "@/components/contextQueue/ContextQueueReviewDropdown.vue";
import { injectContextQueue } from "@/contextQueue/injectContextQueue";
import { injectContextToAgentKey, threadContextQueueKey } from "@/contextQueue/injectionKeys";
import type { QueueItem } from "@/contextQueue/types";
import { useThreadContextQueue } from "@/composables/useThreadContextQueue";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAgentBootstrapCommands } from "@/composables/useAgentBootstrapCommands";
import { expandUserSkillRoot, useAgentSkillRoots } from "@/composables/useAgentSkillRoots";
import { threadAgentResumeCommand } from "@shared/threadAgentBootstrap";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import { isValidPersistedResumeId } from "@shared/resumeSessionId";
import {
  clearInlineThreadDraft,
  loadInlineThreadDraft,
  saveInlineThreadDraft
} from "@/composables/useInlineThreadDraftPersistence";
import {
  loadTerminalLayout,
  resolveCenterTab,
  resolveShellOverlayTab,
  saveTerminalLayout
} from "@/composables/useTerminalLayoutPersistence";
import { useTerminalAttentionSounds } from "@/composables/useTerminalAttentionSounds";
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";
import { useToast } from "@/composables/useToast";
import { useLocalLlm } from "@/composables/useLocalLlm";
import { isWebGpuUsable } from "@/features/localLlm/webgpuSupport";
import { generateThreadTitle } from "@/features/localLlm/client";
import { usePreviewModalOcclusion } from "@/composables/usePreviewModalOcclusion";
import { useWorkspaceKeybindings } from "@/composables/useWorkspaceKeybindings";
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import { formatShortcut, MOD_DIGIT_SLOT_CODES } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import { deriveThreadTitleFromLine } from "@/lib/deriveThreadTitleFromLine";
import { LruMap } from "@/lib/lruMap";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useThreadPtyRunStatus } from "@/composables/useThreadPtyRunStatus";
import { visibleTerminalSessionId } from "@/terminal/attentionRules";
import type { Thread, ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import type {
  AddProjectInput,
  DeleteThreadInput,
  FileDiffScope,
  FileMergeSidesResult,
  RemoveProjectInput,
  RepoScmSnapshot,
  RepoStatusEntry,
  RenameThreadInput,
  WorkspaceSnapshot
} from "@shared/ipc";
const workspace = useWorkspaceStore();
const threadContextQueue = useThreadContextQueue();
provide(threadContextQueueKey, threadContextQueue);

const contextQueueItems = computed((): QueueItem[] => {
  const id = workspace.activeThreadId;
  return id ? threadContextQueue.itemsFor(id) : [];
});

const { terminalNotificationsEnabled, terminalActivitySensitivity } = useTerminalSoundSettings();
/** Fixed policy: bell and background-output rules (settings UI removed). */
const terminalBellSound = ref(true);
const terminalBackgroundOutputSound = ref(false);
const { commands, applySaved, bootstrapCommandLineWithPrompt } = useAgentBootstrapCommands();
const { skillRoots: agentSkillRoots, applySaved: applySavedAgentSkillRoots } = useAgentSkillRoots();
const agentCommandsSettingsOpen = ref(false);
const toast = useToast();
const localLlm = reactive(useLocalLlm());
/** `null` while checking the active worktree; `false` when the folder is not a Git repository. */
const hasGitRepository = ref<boolean | null>(null);
const repoStatus = ref<RepoStatusEntry[]>([]);
const scmMeta = ref<{ shortLabel: string; branch: string; lastCommitSubject: string | null }>({
  shortLabel: "",
  branch: "",
  lastCommitSubject: null
});
const scmCommitMessage = ref("");
const scmFetchBusy = ref(false);
const scmPushBusy = ref(false);
const scmCommitBusy = ref(false);
const selectedScmPath = ref<string | null>(null);
const selectedScmScope = ref<FileDiffScope | null>(null);
const selectedMergeResult = ref<FileMergeSidesResult | null>(null);
const selectedDiffLoading = ref(false);
/** Cap for merge diff result cache (LRU by read + write). */
const DIFF_MERGE_CACHE_MAX = 24;
const diffCache = new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX);

const THREADS_SIDEBAR_COLLAPSED_KEY = "instrument.threadsSidebarCollapsed";

function readThreadsSidebarCollapsed(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(THREADS_SIDEBAR_COLLAPSED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/** When true, thread rail shows agent icons only (narrow column). */
const threadsSidebarCollapsed = ref(readThreadsSidebarCollapsed());

watch(threadsSidebarCollapsed, (collapsed) => {
  try {
    localStorage.setItem(THREADS_SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

const contextQueueReviewRef = ref<InstanceType<typeof ContextQueueReviewDropdown> | null>(null);

watch(
  () => threadContextQueue.lastEnqueueEvent.value,
  (evt) => {
    if (!evt) return;
    if (evt.threadId !== workspace.activeThreadId) return;
    void nextTick(() => {
      contextQueueReviewRef.value?.openReview();
    });
  }
);

/** Top pills: Agent / Git / Files (never `shell:*`). */
const mainCenterTab = ref<"agent" | "diff" | "files" | "preview">("agent");
/** Preview tab is browser-like; hide the stacked terminal strip so it is not confused with the webview. */
const suppressStackedTerminalChrome = computed(() => mainCenterTab.value === "preview");
/** Lower overlay: thread agent vs extra shell tab. */
const shellOverlayTab = ref<"agent" | `shell:${string}`>("agent");
/** One UUID per integrated terminal tab (after Agent + Git). */
const shellSlotIds = ref<string[]>([]);
/** Bottom terminal bar (tab strip for shells); toggled with ⌘J / Ctrl+J. */
const terminalPanelOpen = ref(false);

/** Terminal overlay panel — fixed pixel height, resizable by dragging. */
const DEFAULT_TERMINAL_HEIGHT_PX = 300;
const MIN_TERMINAL_HEIGHT_PX = 120;

function clampTerminalHeight(px: number, containerHeight: number): number {
  const max = Math.floor(containerHeight * 0.85);
  return Math.min(max, Math.max(MIN_TERMINAL_HEIGHT_PX, px));
}

const terminalPanelHeight = ref(DEFAULT_TERMINAL_HEIGHT_PX);
const splitContainerRef = ref<HTMLElement | null>(null);

function onSplitResizePointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const container = splitContainerRef.value;
  if (!container || !terminalPanelOpen.value) return;
  const containerHeight = container.getBoundingClientRect().height;
  if (containerHeight < 32) return;
  const startY = e.clientY;
  const startHeight = terminalPanelHeight.value;

  const onMove = (ev: PointerEvent): void => {
    const dy = ev.clientY - startY;
    // Drag up (negative dy) → panel grows; drag down → panel shrinks
    terminalPanelHeight.value = clampTerminalHeight(startHeight - dy, containerHeight);
  };
  const onUp = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  e.preventDefault();
}

/** Main center pane always fills available space — terminal overlay does not shift layout. */
const mainCenterSplitFlexStyle = computed(() => ({ flex: "1 1 0%", minHeight: 0 }));

/** Terminal overlay panel uses a fixed pixel height. */
const shellOverlaySplitFlexStyle = computed(
  () =>
    ({
      height: `${terminalPanelHeight.value}px`
    }) as Record<string, string>
);
const agentTerminalPaneRef = ref<InstanceType<typeof TerminalPane> | null>(null);

async function injectContextItemsToActiveAgent(
  items: QueueItem[],
  opts?: { sessionId?: string }
): Promise<boolean> {
  const tid = opts?.sessionId ?? workspace.activeThreadId;
  if (!tid) return false;
  mainCenterTab.value = "agent";
  shellOverlayTab.value = "agent";
  await nextTick();
  agentTerminalPaneRef.value?.focus?.();
  const api = window.workspaceApi;
  if (!api?.ptyWrite) {
    toast.error("Terminal unavailable", "PTY is not available in this environment.");
    return false;
  }
  try {
    await injectContextQueue({
      sessionId: tid,
      items,
      ptyWrite: api.ptyWrite,
      delayMs: 200
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Injection failed";
    toast.error("Could not send to agent", msg);
    return false;
  }
}

provide(injectContextToAgentKey, injectContextItemsToActiveAgent);

async function onContextQueueConfirmed(items: QueueItem[]): Promise<void> {
  const tid = workspace.activeThreadId;
  if (!tid) return;
  const ok = await injectContextItemsToActiveAgent(items);
  if (!ok) return;
  for (const row of items) {
    threadContextQueue.removeItem(tid, row.id);
  }
}

function onContextQueuePersistDraft(items: QueueItem[]): void {
  const tid = workspace.activeThreadId;
  if (!tid) return;
  threadContextQueue.replaceItems(tid, items);
}

/**
 * Function refs fire during render/mount; keep this registry non-reactive so storing pane
 * instances does not feed back into WorkspaceLayout updates.
 */
const shellTerminalPaneRefs = new Map<string, InstanceType<typeof TerminalPane>>();

function setShellTerminalPaneRef(slotId: string, el: unknown): void {
  if (!el) {
    shellTerminalPaneRefs.delete(slotId);
    return;
  }
  shellTerminalPaneRefs.set(slotId, el as InstanceType<typeof TerminalPane>);
}

const threadSidebarRef = ref<InstanceType<typeof ThreadSidebar> | null>(null);
/** Per-thread generation counter: user renames bump this so in-flight WebLLM title refinements abort. */
const threadTitleEpoch = new Map<string, number>();

function bumpThreadTitleEpoch(threadId: string): void {
  threadTitleEpoch.set(threadId, (threadTitleEpoch.get(threadId) ?? 0) + 1);
}

/** Thread currently in "compose prompt" mode — shows inline editor instead of xterm. */
const inlinePromptThreadId = ref<string | null>(null);
const inlinePromptEditorRef = ref<{ submit: () => void } | null>(null);

/** Display label for the worktree where the inline draft thread will live (footer copy). */
const inlinePromptThreadContextLabel = computed(() => {
  const tid = inlinePromptThreadId.value;
  if (!tid) return null;
  const thread = workspace.threads.find((t) => t.id === tid);
  if (!thread) return null;
  const ctx = workspace.threadContexts.find((c) => c.worktreeId === thread.worktreeId);
  return ctx?.displayLabel ?? null;
});
const fileSearchRef = ref<InstanceType<typeof FileSearchEditor> | null>(null);
const keybindings = useKeybindingsStore();
const keybindingsEnabled = ref(true);
const showBranchPicker = ref(false);
const staleWorktreeIds = ref<Set<string>>(new Set());
const activeContextBadge = computed(() => workspace.activeContextBadge);
const activeContextLabel = computed(() => activeContextBadge.value?.displayLabel ?? null);

/** Thread name in the center toolbar between the branch control and view tabs. */
const toolbarActiveThread = computed(() => {
  const id = workspace.activeThreadId;
  if (!id) return null;
  return workspace.threads.find((t) => t.id === id) ?? null;
});

/** Center bar: branch combobox shows for Git repos unless the active worktree is a non-default worktree. */
const isInNonDefaultWorktree = computed(
  () =>
    workspace.threadGroups.length > 0 &&
    workspace.activeWorktreeId !== workspace.defaultWorktree?.id
);
const showTopBarBranchSwitcher = computed(
  () =>
    hasGitRepository.value === true &&
    !isInNonDefaultWorktree.value &&
    Boolean(workspace.activeProjectId && workspace.activeWorktree?.path)
);
/** Top row: workspace views only (terminal sessions switch from the bottom terminal bar). */
const topCenterPanelTabs = computed<PillTabItem[]>(() => {
  const tabs: PillTabItem[] = [
    {
      value: "agent",
      label: "🤖 Agent",
      shortcutHint: keybindings.shortcutLabelForId("focusAgentTab")
    }
  ];
  if (hasGitRepository.value === true) {
    tabs.push({
      value: "diff",
      label: "🌿 Git",
      shortcutHint: keybindings.shortcutLabelForId("focusGitPanel")
    });
  }
  tabs.push({
    value: "files",
    label: "📄 Files",
    shortcutHint: keybindings.shortcutLabelForId("focusFilesPanel")
  });
  tabs.push({
    value: "preview",
    label: "🌐 Preview",
    shortcutHint: keybindings.shortcutLabelForId("focusPreviewPanel")
  });
  return tabs;
});

/** Bottom bar: extra shell tabs only (thread agent has no pill — it is the default session). */
const bottomTerminalBarTabs = computed<PillTabItem[]>(() => {
  const slots = shellSlotIds.value;
  return slots.map((id, i) => {
    const slotIndex = i;
    return {
      value: `shell:${id}`,
      label: `💻 Terminal ${i + 1}`,
      closable: true,
      shortcutHint:
        slotIndex < MOD_DIGIT_SLOT_CODES.length
          ? formatShortcut({ mod: true, code: MOD_DIGIT_SLOT_CODES[slotIndex] })
          : undefined
    };
  });
});

const topCenterTabModel = computed({
  get: () => mainCenterTab.value,
  set: (v: string) => {
    if (v === "diff") mainCenterTab.value = "diff";
    else if (v === "files") mainCenterTab.value = "files";
    else if (v === "preview") mainCenterTab.value = "preview";
    else mainCenterTab.value = "agent";
  }
});

/** Bottom shell pills only; empty selection means thread agent shell is active. */
const bottomShellTabModel = computed({
  get: () => (shellOverlayTab.value.startsWith("shell:") ? shellOverlayTab.value : ""),
  set: (v: string) => {
    if (v.startsWith("shell:")) {
      shellOverlayTab.value = v as `shell:${string}`;
      terminalPanelOpen.value = true;
    }
  }
});

/** PTY session used for attention sounds: shell tab if selected, else thread agent. */
const visiblePtySessionId = computed(() => {
  const wt = workspace.activeWorktreeId;
  if (shellOverlayTab.value.startsWith("shell:") && wt) {
    return `__shell:${wt}:${shellOverlayTab.value.slice("shell:".length)}`;
  }
  return visibleTerminalSessionId(workspace.activeThreadId, wt);
});

useTerminalAttentionSounds({
  visibleSessionId: visiblePtySessionId,
  notificationsEnabled: terminalNotificationsEnabled,
  bellEnabled: terminalBellSound,
  backgroundEnabled: terminalBackgroundOutputSound,
  activitySensitivity: terminalActivitySensitivity
});

const {
  runStatusByThreadId: ptyRunStatusByThreadId,
  idleAttentionByThreadId: ptyIdleAttentionByThreadId,
  clearIdleAttention: clearPtyIdleAttention,
  markUserInput: markPtyUserInput
} = useThreadPtyRunStatus(computed(() => workspace.threads), {
  activeThreadId: computed(() => workspace.activeThreadId),
  notificationsEnabled: terminalNotificationsEnabled
});

function addShellTerminal(): void {
  terminalPanelOpen.value = true;
  const id = crypto.randomUUID();
  shellSlotIds.value = [...shellSlotIds.value, id];
  shellOverlayTab.value = `shell:${id}`;
}

/** Matches bottom bar pill labels (Terminal 1, …) for queued terminal context. */
function overlayShellQueueSessionLabel(slotId: string): string {
  const i = shellSlotIds.value.indexOf(slotId);
  return i >= 0 ? `Terminal ${i + 1}` : "Shell";
}

const addTerminalTooltipText = computed(() => keybindings.titleWithShortcut("Add terminal", "addTerminal"));

function labelForShellTabClose(tabValue: string): string {
  if (!tabValue.startsWith("shell:")) return "this terminal";
  const id = tabValue.slice("shell:".length);
  const idx = shellSlotIds.value.indexOf(id);
  return idx >= 0 ? `Terminal ${idx + 1}` : "this terminal";
}

function onCenterTabClose(tabValue: string): void {
  if (!tabValue.startsWith("shell:")) return;
  const label = labelForShellTabClose(tabValue);
  const addShortcut = keybindings.shortcutLabelForId("addTerminal");
  const ok = window.confirm(
    `Close ${label}?\n\nThe shell session for this tab will end. You can add a new terminal tab later (${addShortcut}).`
  );
  if (ok) void performCloseShellTab(tabValue);
}

async function performCloseShellTab(tabValue: string): Promise<void> {
  if (!tabValue.startsWith("shell:")) return;
  const slotId = tabValue.slice("shell:".length);
  const api = getApi();
  const wt = workspace.activeWorktreeId;
  if (api && wt) {
    try {
      await api.ptyKill(`__shell:${wt}:${slotId}`);
    } catch {
      /* session may already be gone */
    }
  }
  shellSlotIds.value = shellSlotIds.value.filter((s) => s !== slotId);
  if (shellOverlayTab.value === tabValue) {
    shellOverlayTab.value = "agent";
  }
}

function focusActiveTerminal(): void {
  void nextTick(() => {
    if (shellOverlayTab.value.startsWith("shell:")) {
      const id = shellOverlayTab.value.slice("shell:".length);
      const pane = shellTerminalPaneRefs.get(id);
      pane?.refresh?.();
      pane?.focus?.();
    } else {
      agentTerminalPaneRef.value?.refresh?.();
      agentTerminalPaneRef.value?.focus?.();
    }
  });
}

/** With the lower panel open and extra shells present, default selection to Terminal 1 (not agent). */
function selectFirstShellTerminalIfPanelOpen(): void {
  if (!terminalPanelOpen.value) return;
  const slots = shellSlotIds.value;
  if (slots.length === 0) return;
  if (mainCenterTab.value !== "agent") return;
  shellOverlayTab.value = `shell:${slots[0]!}`;
}

function openTerminalOverlayPanel(): void {
  terminalPanelOpen.value = true;
  if (shellSlotIds.value.length === 0) {
    addShellTerminal();
  } else {
    selectFirstShellTerminalIfPanelOpen();
  }
}

function toggleTerminalPanelFromShortcut(): void {
  const next = !terminalPanelOpen.value;
  terminalPanelOpen.value = next;
  if (next) {
    if (shellSlotIds.value.length === 0) {
      addShellTerminal();
    } else {
      selectFirstShellTerminalIfPanelOpen();
    }
    focusActiveTerminal();
  }
}

/** After creating a thread from the agent menu, run the agent’s bootstrap CLI once in that PTY. */
const pendingAgentBootstrap = ref<PendingAgentBootstrap | null>(null);

/** If a thread has a stored resumeId and is in "resumable" state, auto-set its bootstrap command. */
function maybeSetResumeBootstrap(threadId: string | null): void {
  if (!threadId) return;
  const thread = workspace.threads.find((t) => t.id === threadId);
  if (!thread) return;
  const session = workspace.threadSessionFor(threadId);
  if (
    !session?.resumeId ||
    session.status !== "resumable" ||
    !isValidPersistedResumeId(session.resumeId)
  ) return;
  if (pendingAgentBootstrap.value?.threadId === threadId) return;
  pendingAgentBootstrap.value = {
    threadId,
    command: threadAgentResumeCommand(thread.agent, session.resumeId),
    mode: "resume"
  };
}
const repoDirectoryInput = ref<HTMLInputElement | null>(null);
let pendingRepoDirectoryResolve: ((value: string | null) => void) | null = null;
let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let disposeOpenWorkspaceSettings: (() => void) | null = null;
/** Incremented per diff refresh; stale async results are ignored (rapid worktree switch / overlap). */
let diffRefreshSeq = 0;
let selectedDiffSeq = 0;

const layoutColumns = computed(() => {
  const threadsWidth = threadsSidebarCollapsed.value ? "0" : "260px";
  return `${threadsWidth} minmax(0, 1fr)`;
});

const scmBranchLine = computed(() => {
  const { shortLabel, branch } = scmMeta.value;
  if (!branch) return null as string | null;
  return shortLabel ? `${shortLabel} / ${branch}` : branch;
});

/** Main panels (threads, terminal, diff) require an active worktree path. */
const hasActiveWorkspace = computed(() => Boolean(workspace.activeWorktree));
const activeWorktreeHasThreads = computed(() => workspace.activeThreads.length > 0);

/** Files is always rooted at the accepted active worktree context. */
const fileExplorerWorktree = computed(() => workspace.activeWorktree);

const activeWorktreePath = computed(
  () => workspace.worktrees.find((w) => w.id === workspace.activeWorktreeId)?.path ?? null
);

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

const AGENT_KEYS_FOR_SKILL_ROOT_SYNC: ThreadAgent[] = ["claude", "cursor", "codex", "gemini"];

async function syncAgentSkillSearchRootsToMain(): Promise<void> {
  const api = getApi();
  if (!api?.setAgentSkillSearchRoots) return;
  let home: string | null = null;
  try {
    const h = await api.getUserHomeDir?.();
    home = typeof h === "string" && h.trim() ? h.trim() : null;
  } catch {
    home = null;
  }
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const agent of AGENT_KEYS_FOR_SKILL_ROOT_SYNC) {
    const expanded = expandUserSkillRoot(agentSkillRoots.value[agent], home);
    if (!expanded || seen.has(expanded)) continue;
    seen.add(expanded);
    roots.push(expanded);
  }
  await api.setAgentSkillSearchRoots(roots);
}

watch(
  agentSkillRoots,
  () => {
    void syncAgentSkillSearchRootsToMain();
  },
  { deep: true, immediate: true }
);

const scmFetchAvailable = computed(() => Boolean(getApi()?.gitFetch));
const scmPushAvailable = computed(() => Boolean(getApi()?.gitPush));
const scmCommitAvailable = computed(() => Boolean(getApi()?.commitStaged));

const scmHasStagedFiles = computed(() =>
  repoStatus.value.some((e) => Boolean(e.stagedKind) && !e.isUntracked)
);

const scmSuggestCommitAvailable = computed(
  () =>
    Boolean(getApi()?.stagedUnifiedDiff) &&
    hasGitRepository.value === true
);

const scmSuggestCommitBusy = computed(
  () => localLlm.commitSuggestState === "generating" || localLlm.commitSuggestState === "loading"
);

const scmSuggestCommitDisabledReason = computed(() => {
  if (localLlm.webGpuOk === false) {
    return "WebGPU is not available. Commit suggestions require WebGPU.";
  }
  return null;
});

async function refreshSnapshot(snapshot?: WorkspaceSnapshot): Promise<void> {
  const api = getApi();
  if (!api) return;
  const next = snapshot ?? ((await api.getSnapshot()) as WorkspaceSnapshot);
  workspace.hydrate(next);
}

function cacheKey(cwd: string, path: string, scope: FileDiffScope): string {
  return `${cwd}\0${scope}\0${path}`;
}

function normalizeRepoStatusResult(
  raw: RepoScmSnapshot | RepoStatusEntry[]
): { entries: RepoStatusEntry[]; meta: RepoScmSnapshot | null } {
  if (Array.isArray(raw)) {
    return { entries: raw, meta: null };
  }
  return { entries: raw.entries, meta: raw };
}

function applyRepoStatusSelection(status: RepoStatusEntry[]): void {
  const hasCurrentSelection =
    selectedScmPath.value &&
    selectedScmScope.value &&
    status.some((entry) => {
      if (entry.path !== selectedScmPath.value) return false;
      return selectedScmScope.value === "staged" ? Boolean(entry.stagedKind) : Boolean(entry.unstagedKind || entry.isUntracked);
    });
  if (hasCurrentSelection) return;

  const firstStaged = status.find((entry) => entry.stagedKind);
  if (firstStaged) {
    selectedScmPath.value = firstStaged.path;
    selectedScmScope.value = "staged";
    return;
  }
  const firstUnstaged = status.find((entry) => entry.unstagedKind || entry.isUntracked);
  selectedScmPath.value = firstUnstaged?.path ?? null;
  selectedScmScope.value = firstUnstaged ? "unstaged" : null;
}

async function loadSelectedMerge(): Promise<void> {
  const api = getApi();
  const path = selectedScmPath.value;
  const scope = selectedScmScope.value;
  if (!api || !workspace.activeWorktree || !path || !scope) {
    selectedMergeResult.value = null;
    selectedDiffLoading.value = false;
    return;
  }
  if (scope === "combined") {
    selectedMergeResult.value = {
      kind: "error",
      message: "Combined diff scope is not supported for merge view."
    };
    selectedDiffLoading.value = false;
    return;
  }
  const seq = ++selectedDiffSeq;
  const cwd = workspace.activeWorktree.path;
  const key = cacheKey(cwd, path, scope);
  const cached = diffCache.get(key);
  if (cached != null) {
    selectedMergeResult.value = cached;
    selectedDiffLoading.value = false;
    return;
  }
  if (!api.fileMergeSides) {
    selectedMergeResult.value = {
      kind: "error",
      message: "Update the desktop app to show merge diff in source control."
    };
    selectedDiffLoading.value = false;
    return;
  }
  selectedMergeResult.value = null;
  selectedDiffLoading.value = true;
  try {
    const result = await api.fileMergeSides(cwd, path, scope);
    if (seq !== selectedDiffSeq || workspace.activeWorktree?.path !== cwd) return;
    selectedMergeResult.value = result;
    diffCache.set(key, result);
  } catch (error) {
    if (seq !== selectedDiffSeq || workspace.activeWorktree?.path !== cwd) return;
    selectedMergeResult.value = {
      kind: "error",
      message: error instanceof Error ? error.message : "Could not load diff."
    };
  } finally {
    if (seq === selectedDiffSeq) selectedDiffLoading.value = false;
  }
}

async function refreshRepoStatus(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) {
    hasGitRepository.value = null;
    repoStatus.value = [];
    scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
    selectedScmPath.value = null;
    selectedScmScope.value = null;
    selectedMergeResult.value = null;
    selectedDiffLoading.value = false;
    diffCache.clear();
    return;
  }
  const seq = ++diffRefreshSeq;
  const cwd = workspace.activeWorktree.path;

  if (api.isGitRepository) {
    let insideGit = false;
    try {
      insideGit = await api.isGitRepository(cwd);
    } catch {
      insideGit = false;
    }
    if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
    hasGitRepository.value = insideGit;
    if (!insideGit) {
      repoStatus.value = [];
      scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
      selectedScmPath.value = null;
      selectedScmScope.value = null;
      selectedMergeResult.value = null;
      selectedDiffLoading.value = false;
      diffCache.clear();
      return;
    }
  } else {
    if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
    hasGitRepository.value = true;
  }

  try {
    const rawStatus = api.repoStatus
      ? await api.repoStatus(cwd)
      : (await api.changedFiles(cwd)).map((path) => ({
          path,
          originalPath: null,
          stagedKind: null,
          unstagedKind: "modified" as const,
          isUntracked: false
        }));
    if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
    const { entries: statusEntries, meta } = normalizeRepoStatusResult(rawStatus);
    repoStatus.value = statusEntries;
    if (meta) {
      scmMeta.value = {
        shortLabel: meta.shortLabel,
        branch: meta.branch,
        lastCommitSubject: meta.lastCommitSubject
      };
    } else {
      scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
    }
    applyRepoStatusSelection(statusEntries);
    diffCache.clear();
    await loadSelectedMerge();
  } catch (error) {
    if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
    repoStatus.value = [];
    scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
    const message = error instanceof Error ? error.message : "";
    if (/not a git repository/i.test(message)) {
      hasGitRepository.value = false;
      selectedScmPath.value = null;
      selectedScmScope.value = null;
      selectedMergeResult.value = null;
    } else {
      selectedMergeResult.value = {
        kind: "error",
        message:
          error instanceof Error
            ? `Could not load source control status: ${error.message}`
            : "Could not load source control status."
      };
    }
    selectedDiffLoading.value = false;
  }
}

async function handleInitializeGit(): Promise<void> {
  const api = getApi();
  const cwd = workspace.activeWorktree?.path;
  if (!cwd) return;
  if (!api?.initGitRepository) {
    toast.error(
      "Initialize Git in the terminal",
      "Run git init in this folder from the integrated terminal, then refresh or switch workspace."
    );
    return;
  }
  try {
    await api.initGitRepository(cwd);
    await refreshRepoStatus();
  } catch (e) {
    toast.error(
      "Could not initialize Git",
      e instanceof Error ? e.message : "Something went wrong."
    );
  }
}

async function onRepoDirectoryInputChange(event: Event): Promise<void> {
  const settle = pendingRepoDirectoryResolve;
  if (!settle) return;
  const input = event.target as HTMLInputElement;
  const files = input.files;
  input.value = "";
  const api = getApi();

  if (files?.length && api?.resolveRepoRootFromWebkitFile) {
    try {
      settle(api.resolveRepoRootFromWebkitFile(files[0]));
    } catch {
      settle(null);
    }
    return;
  }

  if (api?.pickRepoDirectory) {
    try {
      settle(await api.pickRepoDirectory());
    } catch {
      settle(null);
    }
    return;
  }
  settle(null);
}

async function handleCreateProject(): Promise<void> {
  const api = getApi();

  let repoPath: string | null = null;

  if (api?.pickRepoDirectory) {
    try {
      repoPath = await api.pickRepoDirectory();
    } catch {
      toast.error("Unable to add workspace", "Could not open the folder dialog.");
      return;
    }
  } else if (api?.resolveRepoRootFromWebkitFile && repoDirectoryInput.value) {
    repoPath = await new Promise<string | null>((resolve) => {
      let settled = false;
      let onWindowFocus: (() => void) | null = null;
      const settle = (value: string | null): void => {
        if (settled) return;
        settled = true;
        if (onWindowFocus) window.removeEventListener("focus", onWindowFocus);
        pendingRepoDirectoryResolve = null;
        resolve(value);
      };
      pendingRepoDirectoryResolve = settle;
      onWindowFocus = (): void => {
        setTimeout(() => settle(null), 250);
      };
      window.addEventListener("focus", onWindowFocus, { once: true });
      repoDirectoryInput.value!.click();
    });
  }

  if (!repoPath) {
    if (!api) {
      toast.error(
        "Unable to add workspace",
        "Folder picking only works in the Electron app. From the project root, run: `pnpm dev:electron`"
      );
    } else if (!api.resolveRepoRootFromWebkitFile && !api.pickRepoDirectory) {
      toast.error(
        "Unable to add workspace",
        "Quit and restart the desktop app so the folder picker can load."
      );
    }
    return;
  }

  const segments = repoPath.split(/[/\\]/).filter(Boolean);
  const name = segments[segments.length - 1] ?? "Project";
  const defaultBranch = "main";
  const payload: AddProjectInput = { name, repoPath, defaultBranch };
  const snapshot = (await api.addProject(payload)) as WorkspaceSnapshot;
  await refreshSnapshot(snapshot);
  await refreshRepoStatus();
}

async function syncWorktrees(projectId: string): Promise<void> {
  const api = getApi();
  if (!api?.syncWorktrees) return;
  const snapshot = await api.syncWorktrees(projectId);
  if (snapshot) await refreshSnapshot(snapshot as WorkspaceSnapshot);
}

async function confirmFilesContextSwitch(nextWorktreeId: string | null): Promise<boolean> {
  const currentWorktreeId = workspace.activeWorktreeId;
  if (!currentWorktreeId || nextWorktreeId === currentWorktreeId) return true;

  const nextWorktreePath =
    workspace.worktrees.find((worktree) => worktree.id === nextWorktreeId)?.path ?? null;

  return (await fileSearchRef.value?.confirmContextSwitch?.(nextWorktreePath)) ?? true;
}

async function handleSelectProject(projectId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  await syncWorktrees(projectId);
  const project = workspace.projects.find((entry) => entry.id === projectId);
  const fallbackWorktreeId =
    project?.lastActiveWorktreeId ??
    workspace.worktrees.find((worktree) => worktree.projectId === projectId)?.id ??
    null;
  const fallbackThreadId =
    workspace.worktrees.find((worktree) => worktree.id === fallbackWorktreeId)?.lastActiveThreadId ?? null;
  if (!(await confirmFilesContextSwitch(fallbackWorktreeId))) return;
  await api.setActive({ projectId, worktreeId: fallbackWorktreeId, threadId: fallbackThreadId });
  await refreshSnapshot();
  await refreshRepoStatus();
}

async function handleRemoveProject(projectId: string): Promise<void> {
  const api = getApi();
  if (!api?.removeProject) return;
  const project = workspace.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  const confirmed = window.confirm(`Remove ${project.name} from workspace tabs?`);
  if (!confirmed) return;
  const payload: RemoveProjectInput = { projectId };
  await api.removeProject(payload);
  await refreshSnapshot();
  await refreshRepoStatus();
}

async function handleReorderProjects(orderedProjectIds: string[]): Promise<void> {
  const api = getApi();
  if (!api?.reorderProjects) return;
  await api.reorderProjects({ orderedProjectIds });
  await refreshSnapshot();
}

async function handleSelectWorktree(worktreeId: string): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  const targetWt = workspace.worktrees.find((w) => w.id === worktreeId);
  if (!targetWt) return false;
  if (workspace.activeWorktreeId === targetWt.id) return true;
  if (!(await confirmFilesContextSwitch(targetWt.id))) return false;
  const firstThreadInWt = workspace.threads.find((t) => t.worktreeId === targetWt.id)?.id ?? null;
  await api.setActive({
    projectId: targetWt.projectId,
    worktreeId: targetWt.id,
    threadId: targetWt.lastActiveThreadId ?? firstThreadInWt
  });
  await refreshSnapshot();
  await refreshRepoStatus();
  return true;
}

const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

/** While the thread title is still generic, refine it from the first line typed in the agent PTY (before Enter). */
function threadTitleEligibleForTerminalDraftLlm(thread: Thread): boolean {
  if (thread.title.trim() === "New thread") return true;
  const base = THREAD_AGENT_LABELS[thread.agent];
  return thread.title === base || thread.title.startsWith(`${base} · `);
}

const firstLineTitleCaptureThreadId = ref<string | null>(null);
const terminalTitleDraftBuffer = ref("");

const TERMINAL_DRAFT_LLM_DEBOUNCE_MS = 450;

let terminalDraftLlmTimer: ReturnType<typeof setTimeout> | null = null;

function clearTerminalDraftLlmDebounce(): void {
  if (terminalDraftLlmTimer !== null) {
    clearTimeout(terminalDraftLlmTimer);
    terminalDraftLlmTimer = null;
  }
}

function stopFirstLineTitleCapture(): void {
  clearTerminalDraftLlmDebounce();
  firstLineTitleCaptureThreadId.value = null;
  terminalTitleDraftBuffer.value = "";
}

function scheduleTerminalDraftLlmDebounce(threadId: string): void {
  clearTerminalDraftLlmDebounce();
  terminalDraftLlmTimer = setTimeout(() => {
    terminalDraftLlmTimer = null;
    void runTerminalDraftLlmTitle(threadId);
  }, TERMINAL_DRAFT_LLM_DEBOUNCE_MS);
}

async function runTerminalDraftLlmTitle(threadId: string, draftOverride?: string): Promise<void> {
  const trimmed = (draftOverride ?? terminalTitleDraftBuffer.value).trim();
  if (trimmed.length < 1) return;

  const thread = workspace.threads.find((t) => t.id === threadId);
  if (!thread || !threadTitleEligibleForTerminalDraftLlm(thread)) return;

  const api = getApi();
  if (!api?.renameThread) return;

  const label = THREAD_AGENT_LABELS[thread.agent];
  const titleEpochBaseline = threadTitleEpoch.get(threadId) ?? 0;

  let nextTitle: string | null = null;
  try {
    if (await isWebGpuUsable()) {
      nextTitle = await generateThreadTitle(trimmed, label);
    }
  } catch {
    nextTitle = null;
  }
  if (!nextTitle) {
    nextTitle = deriveThreadTitleFromLine(trimmed);
  }
  if (!nextTitle) return;

  if ((threadTitleEpoch.get(threadId) ?? 0) !== titleEpochBaseline) return;
  const t = workspace.threads.find((th) => th.id === threadId);
  if (!t || !threadTitleEligibleForTerminalDraftLlm(t)) return;

  try {
    await api.renameThread({ threadId, title: nextTitle });
    await refreshSnapshot();
  } catch {
    /* keep title */
  }
}

function appendTerminalTitleDraft(threadId: string, chunk: string): void {
  if (firstLineTitleCaptureThreadId.value !== threadId) return;

  const thread = workspace.threads.find((t) => t.id === threadId);
  if (!thread || !threadTitleEligibleForTerminalDraftLlm(thread)) {
    stopFirstLineTitleCapture();
    return;
  }

  for (const c of chunk) {
    if (c === "\r" || c === "\n") {
      clearTerminalDraftLlmDebounce();
      const line = terminalTitleDraftBuffer.value;
      terminalTitleDraftBuffer.value = "";
      firstLineTitleCaptureThreadId.value = null;
      void runTerminalDraftLlmTitle(threadId, line);
      return;
    }
    if (c === "\u007f" || c === "\b") {
      terminalTitleDraftBuffer.value = terminalTitleDraftBuffer.value.slice(0, -1);
    } else {
      const code = c.codePointAt(0)!;
      if (code >= 32 || c === "\t") terminalTitleDraftBuffer.value += c;
    }
  }
  scheduleTerminalDraftLlmDebounce(threadId);
}

function onAgentTerminalStdinChunk(sessionId: string, data: string): void {
  appendTerminalTitleDraft(sessionId, data);
}

function defaultTitleForAgent(agent: ThreadAgent): string {
  const label = THREAD_AGENT_LABELS[agent];
  const sameAgentCount = workspace.activeThreads.filter((t) => t.agent === agent).length;
  if (sameAgentCount === 0) return label;
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${label} · ${stamp}`;
}

function resolveNewThreadTitle(payload: ThreadCreateWithAgentPayload, agent: ThreadAgent): string {
  const explicit = payload.threadTitle?.trim();
  if (explicit) return explicit;
  const first = payload.prompt.trim().split(/\n/)[0]?.trim() ?? "";
  if (first && !first.startsWith("[")) return first;
  return defaultTitleForAgent(agent);
}

function onTerminalBootstrapConsumed(): void {
  pendingAgentBootstrap.value = null;
}

async function onInlinePromptSubmit(payload: ThreadCreateWithAgentPayload): Promise<void> {
  const threadId = inlinePromptThreadId.value;
  if (!threadId) return;
  stopFirstLineTitleCapture();
  const draftWt = workspace.threads.find((t) => t.id === threadId)?.worktreeId;
  if (draftWt) clearInlineThreadDraft(draftWt);
  const { agent, prompt } = payload;
  const api = getApi();
  // Inline prompt creates a draft thread before the user picks an agent.
  // Update the thread's `agent` field immediately so the sidebar icon reflects the user's selection.
  const localDraft = workspace.threads.find((t) => t.id === threadId);
  if (localDraft && localDraft.agent !== agent) {
    // Optimistic UI update: refreshSnapshot shortly re-syncs server state.
    localDraft.agent = agent;
  }
  // The agent is chosen at submit time; stop rendering this row as a "pending agent" draft immediately.
  inlinePromptThreadId.value = null;
  if (api?.updateThread) {
    try {
      await api.updateThread({ threadId, agent });
    } catch {
      /* non-fatal: PTY bootstrap still uses the chosen agent */
    }
  }
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
    command: bootstrapCommandLineWithPrompt(agent, prompt),
    mode: "prompt"
  };
  firstLineTitleCaptureThreadId.value = threadId;
  terminalTitleDraftBuffer.value = "";
  /** Snapshot before refresh / LLM so user renames during `refreshSnapshot` still invalidate the model title. */
  const titleEpochBaseline = threadTitleEpoch.get(threadId) ?? 0;
  const heuristicTitle = title;
  await refreshSnapshot();
  void (async () => {
    try {
      try {
        if (!(await isWebGpuUsable())) return;
      } catch {
        return;
      }
      const modelTitle = await generateThreadTitle(prompt, THREAD_AGENT_LABELS[agent]);
      if ((threadTitleEpoch.get(threadId) ?? 0) !== titleEpochBaseline) return;
      const t = workspace.threads.find((th) => th.id === threadId);
      if (!t || t.title.trim() !== heuristicTitle.trim()) return;
      const apiForTitle = getApi();
      if (!apiForTitle) return;
      await apiForTitle.renameThread({ threadId, title: modelTitle });
      await refreshSnapshot();
    } catch {
      /* keep heuristic title */
    }
  })();
}

async function onInlinePromptCancel(): Promise<void> {
  const threadId = inlinePromptThreadId.value;
  if (!threadId) return;
  stopFirstLineTitleCapture();
  const draftWt = workspace.threads.find((t) => t.id === threadId)?.worktreeId;
  if (draftWt) clearInlineThreadDraft(draftWt);
  inlinePromptThreadId.value = null;
  await handleRemoveThread(threadId);
}

function onSaveAgentSettings(payload: {
  commands: Record<ThreadAgent, string>;
  skillRoots: Record<ThreadAgent, string>;
}): void {
  applySaved(payload.commands);
  applySavedAgentSkillRoots(payload.skillRoots);
}

async function handleRemoveThread(threadId: string): Promise<void> {
  if (firstLineTitleCaptureThreadId.value === threadId) stopFirstLineTitleCapture();
  const api = getApi();
  if (!api) return;
  const threadWt = workspace.threads.find((t) => t.id === threadId)?.worktreeId;
  if (threadWt && loadInlineThreadDraft(threadWt) === threadId) {
    clearInlineThreadDraft(threadWt);
  }
  const wasActive = workspace.activeThreadId === threadId;
  const nextThread = wasActive
    ? workspace.activeThreads.find((t) => t.id !== threadId) ?? null
    : null;
  workspace.removeThreadLocal(threadId);
  try {
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
  } catch (e) {
    await refreshSnapshot();
    throw e;
  }
}

async function handleRenameThread(threadId: string, newTitle: string): Promise<void> {
  bumpThreadTitleEpoch(threadId);
  const api = getApi();
  if (!api) return;
  const payload: RenameThreadInput = { threadId, title: newTitle };
  await api.renameThread(payload);
  await refreshSnapshot();
}

function tryRestoreInlineThreadDraft(): void {
  const wt = workspace.activeWorktreeId;
  if (!wt) return;
  const draftId = loadInlineThreadDraft(wt);
  if (!draftId) return;
  if (!workspace.threads.some((t) => t.id === draftId)) {
    clearInlineThreadDraft(wt);
    return;
  }
  if (workspace.activeThreadId !== draftId) return;
  inlinePromptThreadId.value = draftId;
}

async function openInlineThreadPrompt(worktreeId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const projectId =
    workspace.activeProjectId ??
    workspace.worktrees.find((worktree) => worktree.id === worktreeId)?.projectId ??
    null;
  if (!projectId) return;
  const created = await api.createThread({
    projectId,
    worktreeId,
    title: "New thread",
    agent: readPreferredThreadAgent()
  });
  if (!created?.id) return;
  await refreshSnapshot();
  inlinePromptThreadId.value = created.id;
  saveInlineThreadDraft(worktreeId, created.id);
  mainCenterTab.value = "agent";
}

function openAddThreadFromToolbarOrEmpty(): void {
  const worktreeId = resolvePrimaryWorktreeId();
  if (!worktreeId) return;
  void openInlineThreadPrompt(worktreeId);
}

async function handleCreateWorktreeGroup(branch: string, baseBranch: string | null): Promise<void> {
  const api = getApi();
  const projectId = workspace.activeProjectId;
  if (!api?.createWorktreeGroup || !projectId) return;

  try {
    await api.createWorktreeGroup({ projectId, branch, baseBranch });
    showBranchPicker.value = false;
    await refreshSnapshot();
  } catch (e) {
    toast.error(
      "Could not create thread group",
      e instanceof Error ? e.message : "Something went wrong."
    );
  }
}

async function handleDeleteWorktreeGroup(worktreeId: string): Promise<void> {
  const api = getApi();
  if (!api?.deleteWorktreeGroup) return;

  try {
    // Kill PTY sessions for all threads in the group before removing the worktree directory
    const groupThreads = workspace.activeProjectThreads.filter((t) => t.worktreeId === worktreeId);
    await Promise.all(
      groupThreads.map((t) => api.ptyKill(t.id).catch(() => { /* session may already be gone */ }))
    );

    await api.deleteWorktreeGroup({ worktreeId });
    await refreshSnapshot();
  } catch (e) {
    toast.error(
      "Could not delete thread group",
      e instanceof Error ? e.message : "Something went wrong."
    );
  }
}

async function checkWorktreeHealth(): Promise<void> {
  const api = getApi();
  if (!api?.worktreeHealth) return;

  const nextStale = new Set<string>();
  for (const wt of workspace.threadGroups) {
    const { exists } = await api.worktreeHealth(wt.id);
    if (!exists) nextStale.add(wt.id);
  }
  staleWorktreeIds.value = nextStale;
}

async function handleSelectThread(threadId: string): Promise<void> {
  mainCenterTab.value = "agent";
  const api = getApi();
  if (!api) return;
  const targetThread = workspace.threads.find((thread) => thread.id === threadId);
  if (!targetThread) return;
  if (targetThread.worktreeId === workspace.activeWorktreeId && api.setActiveThread) {
    const snapshot = (await api.setActiveThread(threadId)) as WorkspaceSnapshot;
    await refreshSnapshot(snapshot);
    clearPtyIdleAttention(threadId);
    return;
  }
  if (!(await confirmFilesContextSwitch(targetThread.worktreeId))) return;
  const targetWorktree =
    workspace.worktrees.find((worktree) => worktree.id === targetThread.worktreeId) ?? null;
  await api.setActive({
    projectId: targetWorktree?.projectId ?? targetThread.projectId,
    worktreeId: targetThread.worktreeId,
    threadId
  });
  await refreshSnapshot();
  await refreshRepoStatus();
  clearPtyIdleAttention(threadId);
}

async function handleStageSelected(paths: string[]): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree || paths.length === 0) return;
  if (api.stagePaths) {
    await api.stagePaths(workspace.activeWorktree.path, paths);
  } else {
    await api.stageAll(workspace.activeWorktree.path);
  }
  await refreshRepoStatus();
}

async function handleUnstageSelected(paths: string[]): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree || paths.length === 0) return;
  if (!api.unstagePaths) {
    toast.error("Cannot unstage selection", "Restart the desktop app so per-file unstage is available.");
    return;
  }
  await api.unstagePaths(workspace.activeWorktree.path, paths);
  await refreshRepoStatus();
}

async function handleDiscardSelected(paths: string[]): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree || paths.length === 0) return;
  if (!api.discardPaths) {
    toast.error(
      "Cannot discard selection",
      "Restart the desktop app so per-file discard is available, or discard from the terminal."
    );
    return;
  }
  const label = paths.length === 1 ? paths[0]! : `${paths.length} files`;
  const confirmed = window.confirm(`Discard changes to ${label}?`);
  if (!confirmed) return;
  await api.discardPaths(workspace.activeWorktree.path, paths);
  await refreshRepoStatus();
}

async function handleStageAll(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) return;
  await api.stageAll(workspace.activeWorktree.path);
  await refreshRepoStatus();
}

async function handleUnstageAll(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) return;
  if (!api.unstageAll) {
    toast.error("Cannot unstage all", "Restart the desktop app so unstage-all is available.");
    return;
  }
  await api.unstageAll(workspace.activeWorktree.path);
  await refreshRepoStatus();
}

async function handleDiscardAll(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) return;
  const confirmed = window.confirm("Discard all working tree changes?");
  if (!confirmed) return;
  await api.discardAll(workspace.activeWorktree.path);
  await refreshRepoStatus();
}

async function handleScmFetch(): Promise<void> {
  const api = getApi();
  const cwd = workspace.activeWorktree?.path;
  if (!api?.gitFetch || !cwd) return;
  scmFetchBusy.value = true;
  try {
    await api.gitFetch(cwd);
    await refreshRepoStatus();
  } catch (e) {
    toast.error("Fetch failed", e instanceof Error ? e.message : "Something went wrong.");
  } finally {
    scmFetchBusy.value = false;
  }
}

async function handleScmPush(): Promise<void> {
  const api = getApi();
  const cwd = workspace.activeWorktree?.path;
  if (!api?.gitPush || !cwd) return;
  scmPushBusy.value = true;
  try {
    await api.gitPush(cwd);
    await refreshRepoStatus();
    toast.success("Push succeeded", `Branch \`${scmMeta.value.branch}\` was pushed to the remote.`);
  } catch (e) {
    toast.error("Push failed", e instanceof Error ? e.message : "Something went wrong.");
  } finally {
    scmPushBusy.value = false;
  }
}

async function handleScmCommit(): Promise<void> {
  const message = scmCommitMessage.value.trim();
  if (!message) return;
  const api = getApi();
  const cwd = workspace.activeWorktree?.path;
  if (!api?.commitStaged || !cwd) {
    toast.error(
      "Commit unavailable",
      "Commit from the UI requires the desktop app with an up-to-date build, or use git commit in the terminal."
    );
    return;
  }
  scmCommitBusy.value = true;
  try {
    await api.commitStaged(cwd, message);
    scmCommitMessage.value = "";
    await refreshRepoStatus();
  } catch (e) {
    toast.error("Commit failed", e instanceof Error ? e.message : "Something went wrong.");
  } finally {
    scmCommitBusy.value = false;
  }
}

async function handleScmSuggestCommit(): Promise<void> {
  await localLlm.suggestFromStaged(workspace.activeWorktree?.path ?? null);
  if (localLlm.commitSuggestState === "ready" && localLlm.commitCandidates.length > 0) {
    scmCommitMessage.value = localLlm.commitCandidates[0];
  }
  if (localLlm.commitSuggestState === "error" && localLlm.commitSuggestError) {
    toast.error("Could not suggest commit", localLlm.commitSuggestError);
  }
}

function handleSelectScmEntry(payload: { path: string; scope: "staged" | "unstaged" }): void {
  selectedScmPath.value = payload.path;
  selectedScmScope.value = payload.scope;
  void loadSelectedMerge();
}

async function handleScmOpenFileInEditor(path: string): Promise<void> {
  mainCenterTab.value = "files";
  await nextTick();
  await fileSearchRef.value?.openWorkspaceFile(path);
}

function handleConfigureCommands(): void {
  agentCommandsSettingsOpen.value = true;
}

function goPrevThread(): void {
  const threads = workspace.activeThreads;
  const cur = workspace.activeThreadId;
  if (threads.length === 0) return;
  const i = cur ? threads.findIndex((t) => t.id === cur) : 0;
  const prev = i <= 0 ? threads.length - 1 : i - 1;
  const t = threads[prev];
  if (t) void handleSelectThread(t.id);
}

function goNextThread(): void {
  const threads = workspace.activeThreads;
  const cur = workspace.activeThreadId;
  if (threads.length === 0) return;
  const i = cur ? threads.findIndex((t) => t.id === cur) : -1;
  const next = i < 0 || i >= threads.length - 1 ? 0 : i + 1;
  const t = threads[next];
  if (t) void handleSelectThread(t.id);
}

function toggleThreadsSidebar(): void {
  threadsSidebarCollapsed.value = !threadsSidebarCollapsed.value;
}

function resolvePrimaryWorktreeId(): string | null {
  const defaultId = workspace.defaultWorktree?.id ?? null;
  if (defaultId) return defaultId;

  const primaryContextId = workspace.threadContexts.find((context) => context.isDefault)?.worktreeId ?? null;
  if (primaryContextId) return primaryContextId;

  if (workspace.activeWorktreeId) return workspace.activeWorktreeId;

  const firstActiveProjectWorktree =
    workspace.worktrees.find((worktree) => worktree.projectId === workspace.activeProjectId)?.id ?? null;
  return firstActiveProjectWorktree;
}

const workspaceLauncherOpen = ref(false);

function openNewThreadMenuFromShortcut(): void {
  const worktreeId = resolvePrimaryWorktreeId();
  if (!worktreeId) return;
  void openInlineThreadPrompt(worktreeId);
}

function focusFileSearchShortcut(): void {
  mainCenterTab.value = "files";
  void nextTick(() => {
    fileSearchRef.value?.focusSearch();
  });
}

function toggleWorkspaceLauncher(): void {
  workspaceLauncherOpen.value = !workspaceLauncherOpen.value;
}

async function onLauncherPickThread(threadId: string): Promise<void> {
  workspaceLauncherOpen.value = false;
  await handleSelectThread(threadId);
}

function onLauncherPickCommand(id: string): void {
  workspaceLauncherOpen.value = false;
  if (id === "toggle-thread-sidebar") {
    toggleThreadsSidebar();
  }
}

async function onLauncherPickFile(payload: {
  relativePath: string;
  worktreeId: string | null;
}): Promise<void> {
  workspaceLauncherOpen.value = false;
  const api = getApi();
  if (!api) return;
  const targetWt =
    payload.worktreeId != null
      ? workspace.worktrees.find((w) => w.id === payload.worktreeId)
      : workspace.activeWorktree;
  if (!targetWt) return;

  if (workspace.activeWorktreeId !== targetWt.id) {
    const switched = await handleSelectWorktree(targetWt.id);
    if (!switched) return;
  }

  mainCenterTab.value = "files";
  await nextTick();
  await fileSearchRef.value?.openWorkspaceFile(payload.relativePath);
}

async function onLauncherPickProject(projectId: string): Promise<void> {
  workspaceLauncherOpen.value = false;
  await handleSelectProject(projectId);
}

async function onLauncherPickWorktree(worktreeId: string): Promise<void> {
  workspaceLauncherOpen.value = false;
  await handleSelectWorktree(worktreeId);
}

usePreviewModalOcclusion();

useWorkspaceKeybindings(
  {
    workspaceUiActive: () => hasActiveWorkspace.value,
    settingsOpen: () => agentCommandsSettingsOpen.value,
    centerTab: () => mainCenterTab.value,
    shellSlotIds: () => shellSlotIds.value,
    terminalPanelOpen: () => terminalPanelOpen.value,
    scmActionsAvailable: () => hasGitRepository.value === true,
    launcherConsumesNavShortcuts: () => workspaceLauncherOpen.value,
    onSelectCenterTab: (tab) => {
      if (tab === "agent" || tab === "diff" || tab === "files" || tab === "preview") {
        mainCenterTab.value = tab;
        return;
      }
      if (tab.startsWith("shell:")) {
        shellOverlayTab.value = tab as `shell:${string}`;
        terminalPanelOpen.value = true;
      }
    },
    onPrevThread: goPrevThread,
    onNextThread: goNextThread,
    onToggleSidebar: toggleThreadsSidebar,
    onOpenNewThreadMenu: openNewThreadMenuFromShortcut,
    onAddTerminal: addShellTerminal,
    onToggleTerminalPanel: toggleTerminalPanelFromShortcut,
    onFocusFileSearch: focusFileSearchShortcut,
    onToggleWorkspaceLauncher: toggleWorkspaceLauncher,
    onStageAllDiff: () => {
      void handleStageAll();
    },
    onOpenSettings: handleConfigureCommands
  },
  keybindingsEnabled
);

function onInlinePromptCmdEnter(ev: KeyboardEvent): void {
  if (!inlinePromptThreadId.value) return;
  const isMac = navigator.platform.toLowerCase().includes("mac");
  if (ev.key === "Enter" && (isMac ? ev.metaKey : ev.ctrlKey)) {
    ev.preventDefault();
    inlinePromptEditorRef.value?.submit();
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onInlinePromptCmdEnter, { capture: true });
  await refreshSnapshot();
  maybeSetResumeBootstrap(workspace.activeThreadId);
  if (workspace.activeProjectId) {
    await syncWorktrees(workspace.activeProjectId);
  }
  await refreshRepoStatus();
  const api = getApi();
  if (api?.onWorkspaceChanged) {
    disposeWorkspaceChanged = api.onWorkspaceChanged(() => {
      void refreshSnapshot();
    });
  }
  if (api?.onWorkingTreeFilesChanged) {
    disposeWorkingTreeFilesChanged = api.onWorkingTreeFilesChanged(() => {
      void refreshRepoStatus();
    });
  }
  if (api?.onOpenWorkspaceSettings) {
    disposeOpenWorkspaceSettings = api.onOpenWorkspaceSettings(() => {
      handleConfigureCommands();
    });
  }
  worktreeHealthInterval = setInterval(() => void checkWorktreeHealth(), 60_000);
  void checkWorktreeHealth();
});

let worktreeHealthInterval: ReturnType<typeof setInterval> | null = null;

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onInlinePromptCmdEnter, { capture: true });
  if (worktreeHealthInterval) clearInterval(worktreeHealthInterval);
  disposeOpenWorkspaceSettings?.();
  disposeOpenWorkspaceSettings = null;
  disposeWorkspaceChanged?.();
  disposeWorkspaceChanged = null;
  disposeWorkingTreeFilesChanged?.();
  disposeWorkingTreeFilesChanged = null;
});

watch(
  () => workspace.activeThreadId,
  (id) => {
    const pending = pendingAgentBootstrap.value;
    if (pending && id !== pending.threadId) pendingAgentBootstrap.value = null;
    maybeSetResumeBootstrap(id);
  }
);

watch(
  () =>
    `${workspace.activeWorktreeId ?? ""}\0${workspace.activeThreadId ?? ""}\0${workspace.threads
      .map((t) => t.id)
      .sort()
      .join(",")}`,
  () => {
    tryRestoreInlineThreadDraft();
  },
  { immediate: true }
);

watch(
  () => workspace.activeWorktreeId,
  async (wt, prev) => {
    if (!wt) {
      shellSlotIds.value = [];
      mainCenterTab.value = "agent";
      shellOverlayTab.value = "agent";
      hasGitRepository.value = null;
    } else if (prev !== wt) {
      hasGitRepository.value = null;
      const saved = loadTerminalLayout(wt);
      if (saved) {
        shellSlotIds.value = saved.shellSlotIds;
        const resolvedMain = resolveCenterTab(saved.centerTab, saved.shellSlotIds);
        if (resolvedMain.startsWith("shell:")) {
          mainCenterTab.value = "agent";
          shellOverlayTab.value = resolveShellOverlayTab(resolvedMain, saved.shellSlotIds);
        } else {
          mainCenterTab.value = resolvedMain as "agent" | "diff" | "files" | "preview";
          shellOverlayTab.value = saved.shellOverlayTab
            ? resolveShellOverlayTab(saved.shellOverlayTab, saved.shellSlotIds)
            : "agent";
        }
        if (typeof saved.terminalPanelOpen === "boolean") {
          terminalPanelOpen.value = saved.terminalPanelOpen;
        }
        if (typeof saved.terminalPanelHeightPx === "number") {
          terminalPanelHeight.value = Math.max(MIN_TERMINAL_HEIGHT_PX, saved.terminalPanelHeightPx);
        }
      } else if (prev != null) {
        shellSlotIds.value = [];
        if (shellOverlayTab.value.startsWith("shell:")) {
          shellOverlayTab.value = "agent";
        }
      }
      selectFirstShellTerminalIfPanelOpen();
    }
    await refreshRepoStatus();
  },
  { immediate: true }
);

watch(
  [
    mainCenterTab,
    shellOverlayTab,
    shellSlotIds,
    terminalPanelOpen,
    terminalPanelHeight,
    () => workspace.activeWorktreeId
  ],
  () => {
    const wt = workspace.activeWorktreeId;
    if (!wt) return;
    saveTerminalLayout(wt, {
      centerTab: mainCenterTab.value,
      shellOverlayTab: shellOverlayTab.value,
      shellSlotIds: [...shellSlotIds.value],
      terminalPanelOpen: terminalPanelOpen.value,
      terminalPanelHeightPx: terminalPanelHeight.value
    });
  }
);

watch(shellSlotIds, (ids) => {
  if (!shellOverlayTab.value.startsWith("shell:")) return;
  const slotId = shellOverlayTab.value.slice("shell:".length);
  if (!ids.includes(slotId)) shellOverlayTab.value = "agent";
});

watch(
  () => mainCenterTab.value,
  (tab, prevTab) => {
    if (tab === "diff") void refreshRepoStatus();
    if (tab === "files" && prevTab !== "files") {
      void nextTick(() => {
        fileSearchRef.value?.refreshFileExplorer?.();
        fileSearchRef.value?.focusSearch?.();
      });
    }
    if (tab === "agent") {
      void nextTick(() => agentTerminalPaneRef.value?.refresh?.());
    }
  },
  { flush: "post" }
);

watch(
  () => terminalPanelOpen.value,
  (open) => {
    if (!open) return;
    void nextTick(() => {
      const tab = shellOverlayTab.value;
      if (tab.startsWith("shell:")) {
        shellTerminalPaneRefs.get(tab.slice("shell:".length))?.refresh?.();
      } else {
        agentTerminalPaneRef.value?.refresh?.();
      }
    });
  },
  { flush: "post" }
);

watch(
  () => shellOverlayTab.value,
  (tab) => {
    if (!terminalPanelOpen.value) return;
    void nextTick(() => {
      if (tab.startsWith("shell:")) {
        shellTerminalPaneRefs.get(tab.slice("shell:".length))?.refresh?.();
      } else {
        agentTerminalPaneRef.value?.refresh?.();
      }
    });
  },
  { flush: "post" }
);

watch(
  () => [mainCenterTab.value, hasGitRepository.value] as const,
  ([tab, git]) => {
    // Only leave Git tab when we know there is no repo. While `null` (loading), switching away
    // fights async refresh and can contribute to recursive update / focus churn.
    if (tab === "diff" && git === false) {
      mainCenterTab.value = "agent";
    }
  },
  { flush: "post" }
);
</script>

<template>
  <main class="relative flex h-screen flex-col">
    <div
      v-if="workspace.projects.length === 0"
      class="pointer-events-none absolute top-2 right-2 z-10"
    >
      <div class="pointer-events-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Settings"
          :title="keybindings.titleWithShortcut('Settings', 'openSettings')"
          @click="handleConfigureCommands"
        >
          <Settings class="h-3.5 w-3.5" />
        </Button>
        <ThemeToggle />
      </div>
    </div>
    <input
      ref="repoDirectoryInput"
      type="file"
      class="fixed top-0 left-0 h-px w-px opacity-0"
      aria-hidden="true"
      tabindex="-1"
      webkitdirectory
      @change="onRepoDirectoryInputChange"
    />   
    <ProjectTabs
      v-if="workspace.projects.length > 0 && !hasActiveWorkspace"
      :projects="workspace.projects"
      :worktrees="workspace.worktrees"
      :threads="workspace.threads"
      :idle-attention-by-thread-id="ptyIdleAttentionByThreadId"
      :run-status-by-thread-id="ptyRunStatusByThreadId"
      :active-project-id="workspace.activeProjectId"
      @select="handleSelectProject"
      @remove="handleRemoveProject"
      @reorder="handleReorderProjects"
      @create="handleCreateProject"
      @configure-commands="handleConfigureCommands"
    />

    <section
      v-if="!hasActiveWorkspace"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <span
        class="text-5xl leading-none"
        aria-hidden="true"
        >{{ workspace.projects.length === 0 ? "📂" : "👆" }}</span
      >
      <div class="max-w-md space-y-2">
        <h1 class="text-lg font-semibold text-foreground">
          {{ workspace.projects.length === 0 ? "Add your first workspace" : "Select a workspace" }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{
            workspace.projects.length === 0
              ? "Connect a local Git repository to use the terminal, threads, and diff."
              : "Choose a project from the tabs above to open that workspace."
          }}
        </p>
      </div>
      <Button v-if="workspace.projects.length === 0" type="button" @click="handleCreateProject">
        Add workspace
      </Button>
    </section>

    <section v-else class="grid min-h-0 flex-1" :style="{ gridTemplateColumns: layoutColumns }">
      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border">        
        <ThreadSidebar
          ref="threadSidebarRef"
          class="min-h-0 min-w-0 flex-1"
          :collapsed="threadsSidebarCollapsed"
          :context-label="activeContextLabel"
          :threads="workspace.activeProjectThreads"
          :active-thread-id="workspace.activeThreadId"
          :run-status-by-thread-id="ptyRunStatusByThreadId"
          :idle-attention-by-thread-id="ptyIdleAttentionByThreadId"
          :thread-groups="workspace.threadGroups"
          :thread-contexts="workspace.threadContexts"
          :default-worktree-id="workspace.defaultWorktree?.id ?? null"
          :stale-worktree-ids="staleWorktreeIds"
          :show-branch-picker="showBranchPicker"
          :project-id="workspace.activeProjectId"
          :inline-prompt-thread-id="inlinePromptThreadId"
          @show-branch-picker="showBranchPicker = true"
          @cancel-branch-picker="showBranchPicker = false"
          @create-worktree-group="handleCreateWorktreeGroup"
          @delete-worktree-group="handleDeleteWorktreeGroup"
          @select="handleSelectThread"
          @remove="handleRemoveThread"
          @rename="handleRenameThread"
          @collapse="threadsSidebarCollapsed = true"
          @expand="threadsSidebarCollapsed = false"
          @add-thread-inline="openInlineThreadPrompt"
        />
      </section>
      <section class="flex min-h-0 min-w-0 flex-col border-r border-border">                                 
        <ProjectTabs
          v-if="workspace.projects.length > 0"
          :projects="workspace.projects"
          :worktrees="workspace.worktrees"
          :threads="workspace.threads"
          :idle-attention-by-thread-id="ptyIdleAttentionByThreadId"
          :run-status-by-thread-id="ptyRunStatusByThreadId"
          :active-project-id="workspace.activeProjectId"
          :collapsed="threadsSidebarCollapsed"
          @expand="threadsSidebarCollapsed = false"
          @select="handleSelectProject"
          @remove="handleRemoveProject"
          @reorder="handleReorderProjects"
          @create="handleCreateProject"
          @configure-commands="handleConfigureCommands"
        />
        <div
          class="flex min-h-0 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-muted/25 py-px pr-1 pl-0.5"
        >
          <ScmBranchCombobox
            v-if="showTopBarBranchSwitcher"
            variant="toolbar"
            :branch-line="scmBranchLine"
            :current-branch="scmMeta.branch"
            :project-id="workspace.activeProjectId ?? ''"
            :cwd="workspace.activeWorktree?.path ?? ''"
            switcher-enabled
            @branch-changed="void refreshRepoStatus()"
          />
          <Badge v-else variant="outline" class="ms-2 shrink-0 text-[10px] text-muted-foreground">
            {{ activeContextLabel }}
          </Badge>
          <div
            class="ms-1 flex min-h-7 min-w-0 flex-1 items-center border-s border-border ps-2"
            data-testid="workspace-toolbar-thread-title"
          >
            <span
              v-if="toolbarActiveThread"
              class="min-w-0 truncate text-xs font-medium text-foreground"
              :title="toolbarActiveThread.title"
            >
              {{ toolbarActiveThread.title }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-1 border-s border-border ps-1">
            <PillTabs
              v-model="topCenterTabModel"
              class="min-w-0 shrink"
              :tabs="topCenterPanelTabs"
              aria-label="Center panel"
            />
            <ContextQueueReviewDropdown
              v-if="workspace.activeThreadId && contextQueueItems.length > 0"
              ref="contextQueueReviewRef"
              :thread-id="workspace.activeThreadId"
              :items="contextQueueItems"
              :worktree-path="activeWorktreePath"
              @confirm="onContextQueueConfirmed"
              @persist-draft="onContextQueuePersistDraft"
            />
          </div>
        </div>
        <div
          v-if="activeWorktreeHasThreads && hasGitRepository === false"
          data-testid="workspace-no-git-empty-state"
          class="flex shrink-0 flex-col gap-3 border-b border-border bg-muted/20 px-4 py-4"
        >
          <div class="flex items-start gap-3">
            <span class="text-2xl leading-none" aria-hidden="true">🌿</span>
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-sm font-medium text-foreground">No Git repository</p>
              <p class="text-sm text-muted-foreground">
                Initialize Git in this folder to use source control and the Git tab.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 pl-9">
            <Button v-if="getApi()?.initGitRepository" type="button" size="sm" @click="handleInitializeGit">
              Initialize Git
            </Button>
            <p v-else class="text-xs text-muted-foreground">
              Run <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">git init</code> in the terminal
              in this workspace.
            </p>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref="splitContainerRef" class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  class="flex min-h-0 flex-col overflow-hidden border-b border-border bg-card"
                  :style="mainCenterSplitFlexStyle"
                >
                  <div v-show="mainCenterTab === 'diff'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <SourceControlPanel
                      v-if="hasGitRepository"
                      v-model:commit-message="scmCommitMessage"
                      :context-label="activeContextLabel"
                      :repo-status="repoStatus"
                      :branch-line="scmBranchLine"
                      :scm-branch="scmMeta.branch"
                      :project-id="workspace.activeProjectId"
                      :scm-cwd="workspace.activeWorktree?.path ?? null"
                      :allow-scm-branch-switcher="!isInNonDefaultWorktree"
                      :last-commit-subject="scmMeta.lastCommitSubject"
                      :scm-fetch-available="scmFetchAvailable"
                      :scm-push-available="scmPushAvailable"
                      :scm-commit-available="scmCommitAvailable"
                      :scm-fetch-busy="scmFetchBusy"
                      :scm-push-busy="scmPushBusy"
                      :scm-commit-busy="scmCommitBusy"
                      :suggest-commit-available="scmSuggestCommitAvailable"
                      :suggest-commit-disabled-reason="scmSuggestCommitDisabledReason"
                      :suggest-commit-busy="scmSuggestCommitBusy"
                      :suggest-commit-gpu-ok="localLlm.webGpuOk"
                      :suggest-commit-truncated="localLlm.lastStagedTruncated"
                      :commit-candidates="localLlm.commitCandidates"
                      :selected-path="selectedScmPath"
                      :selected-scope="selectedScmScope"
                      :merge-result="selectedMergeResult"
                      :merge-loading="selectedDiffLoading"
                      :active-thread-id="workspace.activeThreadId"
                      @select-entry="handleSelectScmEntry"
                      @stage-all="handleStageAll"
                      @unstage-all="handleUnstageAll"
                      @discard-all="handleDiscardAll"
                      @stage-paths="handleStageSelected"
                      @unstage-paths="handleUnstageSelected"
                      @discard-paths="handleDiscardSelected"
                      @fetch="handleScmFetch"
                      @push="handleScmPush"
                      @commit="handleScmCommit"
                      @suggest-commit="handleScmSuggestCommit"
                      @open-file-in-editor="handleScmOpenFileInEditor"
                      @branch-changed="void refreshRepoStatus()"
                    />
                  </div>
                  <div
                    v-show="mainCenterTab === 'files'"
                    data-testid="workspace-files-pane"
                    class="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <FileSearchEditor
                      ref="fileSearchRef"
                      :worktree-path="fileExplorerWorktree?.path ?? null"
                      :active-thread-id="workspace.activeThreadId"
                    />
                  </div>
                  <div v-show="mainCenterTab === 'preview'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <PreviewPanel :is-visible="mainCenterTab === 'preview'" />
                  </div>
                  <div v-show="mainCenterTab === 'agent'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                    <ThreadInlinePromptEditor
                      v-else-if="inlinePromptThreadId && workspace.activeThreadId === inlinePromptThreadId"
                      ref="inlinePromptEditorRef"
                      :worktree-id="workspace.activeWorktreeId ?? ''"
                      :worktree-path="workspace.activeWorktree?.path ?? null"
                      :thread-context-label="inlinePromptThreadContextLabel"
                      @submit="onInlinePromptSubmit"
                      @cancel="onInlinePromptCancel"
                    />
                    <TerminalPane
                      v-else
                      ref="agentTerminalPaneRef"
                      pty-kind="agent"
                      :worktree-id="workspace.activeWorktreeId ?? ''"
                      :thread-id="workspace.activeThreadId ?? ''"
                      :cwd="workspace.activeWorktree?.path ?? ''"
                      :pending-agent-bootstrap="pendingAgentBootstrap"
                      @bootstrap-consumed="onTerminalBootstrapConsumed"
                      @stdin-chunk="onAgentTerminalStdinChunk"
                      @user-typed="markPtyUserInput"
                    />
                  </div>
                </div>
                  <div
                    v-show="terminalPanelOpen && !suppressStackedTerminalChrome"
                    class="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden border-t border-border bg-card shadow-[0_-6px_24px_rgba(0,0,0,0.08)] ring-1 ring-border/60 dark:shadow-[0_-8px_32px_rgba(0,0,0,0.45)]"
                    :style="shellOverlaySplitFlexStyle"
                  >
                    <div
                      class="flex h-1 shrink-0 cursor-row-resize touch-none items-center justify-center border-b border-border bg-muted/40 hover:bg-muted/80"
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize overlay terminal height"
                      data-testid="terminal-bar-resize-handle"
                      @pointerdown="onSplitResizePointerDown"
                    >
                      <span class="h-0.5 w-8 rounded-full bg-border" aria-hidden="true" />
                    </div>
                    <div
                      class="flex shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-muted/25 px-1.5 py-px sm:px-2"
                      role="toolbar"
                      aria-label="Shell terminals"
                      data-testid="overlay-shell-header"
                    >
                      <div
                        class="flex min-h-0 min-w-0 flex-1 items-center gap-1 overflow-hidden"
                        data-testid="overlay-shell-header-actions"
                      >
                        <PillTabs
                          v-model="bottomShellTabModel"
                          class="min-w-0 flex-1"
                          :tabs="bottomTerminalBarTabs"
                          size="sm"
                          aria-label="Terminal sessions"
                          @tab-close="onCenterTabClose"
                        />
                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              class="shrink-0 border-border bg-transparent shadow-none hover:bg-muted/50 dark:border-input dark:bg-transparent dark:hover:bg-input/40"
                              aria-label="Add terminal"
                              @click="addShellTerminal"
                            >
                              <span class="inline-flex items-center gap-1.5">
                                <span class="text-sm leading-none shrink-0" aria-hidden="true">💻</span>
                                <span>Add terminal</span>
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" data-testid="add-terminal-tooltip">
                            {{ addTerminalTooltipText }}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger as-child>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              class="shrink-0 text-muted-foreground"
                              :aria-label="keybindings.titleWithShortcut('Hide overlay terminals', 'toggleTerminalPanel')"
                              @click="terminalPanelOpen = false"
                            >
                              <ChevronDown class="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {{ keybindings.titleWithShortcut("Hide overlay terminals", "toggleTerminalPanel") }}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/15">
                      <div
                        v-for="slotId in shellSlotIds"
                        :key="slotId"
                        v-show="shellOverlayTab === `shell:${slotId}`"
                        class="flex min-h-0 flex-1 flex-col overflow-hidden"
                      >
                        <TerminalPane
                          :ref="(el) => setShellTerminalPaneRef(slotId, el)"
                          pty-kind="shell"
                          :shell-slot-id="slotId"
                          :worktree-id="workspace.activeWorktreeId ?? ''"
                          :thread-id="workspace.activeThreadId ?? ''"
                          :cwd="workspace.activeWorktree?.path ?? ''"
                          :queue-session-label="overlayShellQueueSessionLabel(slotId)"
                          @user-typed="markPtyUserInput"
                        />
                      </div>
                      <div
                        v-if="shellSlotIds.length === 0"
                        class="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground"
                      >
                        Add a terminal to open a second shell in this overlay.
                      </div>
                      <div
                        v-else-if="shellOverlayTab === 'agent'"
                        class="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground"
                      >
                        Select Terminal 1… or add another terminal.
                      </div>
                    </div>
                  </div>
                <button
                  v-if="!terminalPanelOpen && !suppressStackedTerminalChrome"
                  type="button"
                  class="pointer-events-auto flex w-full shrink-0 items-center justify-center gap-2 border-t border-border bg-card py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
:title="keybindings.titleWithShortcut('Show lower terminals', 'toggleTerminalPanel')"
                  :aria-label="keybindings.titleWithShortcut('Show lower terminals', 'toggleTerminalPanel')"
                  @click="openTerminalOverlayPanel"
                >
                  <ChevronUp class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Terminals</span>
                  <kbd
                    class="pointer-events-none rounded border border-border/80 bg-muted/40 px-1 py-px font-mono text-[10px] font-normal text-muted-foreground tabular-nums"
                    >{{ keybindings.shortcutLabelForId("toggleTerminalPanel") }}</kbd
                  >
                </button>
              </div>
        </div>
      </section>
    </section>

    <WorkspaceLauncherModal
      v-model="workspaceLauncherOpen"
      @pick-thread="onLauncherPickThread"
      @pick-file="onLauncherPickFile"
      @pick-command="onLauncherPickCommand"
      @pick-project="onLauncherPickProject"
      @pick-worktree="onLauncherPickWorktree"
    />

    <AgentCommandsSettingsDialog
      v-model="agentCommandsSettingsOpen"
      :commands="commands"
      :skill-roots="agentSkillRoots"
      @save="onSaveAgentSettings"
    />

  </main>
</template>
