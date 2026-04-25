<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronDown, ChevronUp, PanelLeftOpen, Plus, Settings } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import SourceControlPanel from "@/components/SourceControlPanel.vue";
import PreviewPanel from "@/components/PreviewPanel.vue";
import ContextQueueReviewDropdown from "@/components/contextQueue/ContextQueueReviewDropdown.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import ProjectTabs from "@/components/ProjectTabs.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import AgentCommandsSettingsDialog from "@/components/AgentCommandsSettingsDialog.vue";
import FileSearchEditor from "@/components/FileSearchEditor.vue";
import WorkspaceLauncherModal from "@/components/WorkspaceLauncherModal.vue";
import ThreadInlinePromptEditor from "@/components/ThreadInlinePromptEditor.vue";
import BranchPicker from "@/components/BranchPicker.vue";
import { injectContextQueue } from "@/contextQueue/injectContextQueue";
import {
  injectContextToAgentKey,
  openWorkspaceFileKey,
  threadContextQueueKey
} from "@/contextQueue/injectionKeys";
import type { QueueItem } from "@/contextQueue/types";
import { useThreadContextQueue } from "@/composables/useThreadContextQueue";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAgentBootstrapCommands } from "@/composables/useAgentBootstrapCommands";
import { expandUserSkillRoot, useAgentSkillRoots } from "@/composables/useAgentSkillRoots";
import { useWorktreeHealth } from "@/composables/useWorktreeHealth";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { useThreadNavigation } from "@/composables/useThreadNavigation";
import { encodeBranch } from "@/router/branchParam";
import { useScmStore } from "@/stores/scmStore";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
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
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useThreadPtyRunStatus } from "@/composables/useThreadPtyRunStatus";
import { visibleTerminalSessionId } from "@/terminal/attentionRules";
import type { Thread, ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import type {
  AddProjectInput,
  DeleteThreadInput,
  RemoveProjectInput,
  RepoStatusEntry,
  RenameThreadInput,
  WorkspaceSnapshot
} from "@shared/ipc";
const workspace = useWorkspaceStore();
const route = useRoute();
const router = useRouter();
const active = useActiveWorkspace();
const activeProjectId = active.activeProjectId;
const activeWorktreeId = active.activeWorktreeId;
const activeThreadId = active.activeThreadId;
const activeProject = active.activeProject;
const activeWorktree = active.activeWorktree;
const activeThreads = active.activeThreads;
const activeProjectThreads = active.activeProjectThreads;
const defaultWorktree = active.defaultWorktree;
const threadGroups = active.threadGroups;
const threadContexts = active.threadContexts;
const hasActiveWorkspace = active.hasActiveWorkspace;
const activeBranch = active.activeBranch;
const activeContextBadge = active.activeContextBadge;
const threadContextQueue = useThreadContextQueue();
provide(threadContextQueueKey, threadContextQueue);

const contextQueueItems = computed((): QueueItem[] => {
  const id = activeThreadId.value;
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
const scm = useScmStore();

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

/** Top pills: Agent / Git / Files (never `shell:*`); follows vue-router. */
const mainCenterTab = computed<"agent" | "diff" | "files" | "preview">(() => {
  const name = route.name;
  if (name === "git") return "diff";
  if (name === "files" || name === "file") return "files";
  if (name === "preview") return "preview";
  return "agent";
});

/** Navigate center chrome from keybindings, persistence restore, and legacy call sites. */
async function navigateToCenterTab(
  tab: "agent" | "diff" | "files" | "preview"
): Promise<void> {
  const pid = activeProjectId.value;
  const branch = activeBranch.value;
  if (!pid || !branch) return;
  const eb = encodeBranch(branch);
  if (tab === "agent") {
    const tid = activeThreadId.value ?? activeThreads.value[0]?.id;
    if (tid) {
      await router.push({ name: "thread", params: { projectId: pid, branch: eb, threadId: tid } });
    } else {
      await router.push({ name: "files", params: { projectId: pid, branch: eb } });
    }
  } else if (tab === "diff") {
    await router.push({ name: "git", params: { projectId: pid, branch: eb } });
  } else if (tab === "files") {
    await router.push({ name: "files", params: { projectId: pid, branch: eb } });
  } else {
    await router.push({ name: "preview", params: { projectId: pid, branch: eb } });
  }
}
/** Preview tab is browser-like; hide the stacked terminal strip so it is not confused with the webview. */
const suppressStackedTerminalChrome = computed(() => mainCenterTab.value === "preview");
/** Sidebar footer control mirrors the former floating “open terminals” affordance. */
const showThreadSidebarTerminalButton = computed(
  () => !terminalPanelOpen.value && !suppressStackedTerminalChrome.value
);
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
  const tid = opts?.sessionId ?? activeThreadId.value;
  if (!tid) return false;
  const t = workspace.threads.find((x) => x.id === tid);
  const wt = t ? workspace.worktrees.find((w) => w.id === t.worktreeId) : null;
  if (t && wt) {
    void router.push({
      name: "thread",
      params: { projectId: t.projectId, branch: encodeBranch(wt.branch), threadId: tid }
    });
  } else {
    void navigateToCenterTab("agent");
  }
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
provide(openWorkspaceFileKey, async (path: string) => {
  await handleScmOpenFileInEditor(path);
});

async function onContextQueueConfirmed(items: QueueItem[]): Promise<void> {
  const tid = activeThreadId.value;
  if (!tid) return;
  const ok = await injectContextItemsToActiveAgent(items);
  if (!ok) return;
  for (const row of items) {
    threadContextQueue.removeItem(tid, row.id);
  }
}

function onContextQueuePersistDraft(items: QueueItem[]): void {
  const tid = activeThreadId.value;
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
/** When the thread sidebar is collapsed, center tabs live here so they stay reachable. */
const contextQueueCollapsedRef = ref<InstanceType<typeof ContextQueueReviewDropdown> | null>(null);

watch(
  () => threadContextQueue.lastEnqueueEvent.value,
  (evt) => {
    if (!evt) return;
    if (evt.threadId !== activeThreadId.value) return;
    void nextTick(() => {
      if (threadsSidebarCollapsed.value) {
        contextQueueCollapsedRef.value?.openReview();
      } else {
        threadSidebarRef.value?.openContextQueueReview?.();
      }
    });
  }
);

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
  const ctx = threadContexts.value.find((c) => c.worktreeId === thread.worktreeId);
  return ctx?.displayLabel ?? null;
});
const fileSearchRef = ref<InstanceType<typeof FileSearchEditor> | null>(null);
const keybindings = useKeybindingsStore();
const keybindingsEnabled = ref(true);
const showBranchPicker = ref(false);
const staleWorktreeIds = ref<Set<string>>(new Set());
const activeContextLabel = computed(() => activeContextBadge.value?.displayLabel ?? null);

/** Thread name in the center toolbar between the branch control and view tabs. */
const toolbarActiveThread = computed(() => {
  const id = activeThreadId.value;
  if (!id) return null;
  return workspace.threads.find((t) => t.id === id) ?? null;
});

/** Center bar: branch combobox shows for Git repos unless the active worktree is a non-default worktree. */
const isInNonDefaultWorktree = computed(
  () =>
    threadGroups.value.length > 0 && activeWorktreeId.value !== defaultWorktree.value?.id
);
const showTopBarBranchSwitcher = computed(
  () =>
    scm.hasGitRepository === true &&
    !isInNonDefaultWorktree.value &&
    Boolean(activeProjectId.value && activeWorktree.value?.path)
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
  if (scm.hasGitRepository === true) {
    tabs.push({
      value: "diff",
      label: "🌿 Git",
      shortcutHint: keybindings.shortcutLabelForId("focusGitPanel")
    });
  }
  tabs.push({
    value: "files",
    label: "📁 Files",
    shortcutHint: keybindings.shortcutLabelForId("focusFilesPanel")
  });
  tabs.push({
    value: "preview",
    label: "🌐 Browser",
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
    if (v === "diff") void navigateToCenterTab("diff");
    else if (v === "files") void navigateToCenterTab("files");
    else if (v === "preview") void navigateToCenterTab("preview");
    else void navigateToCenterTab("agent");
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
  const wt = activeWorktreeId.value;
  if (shellOverlayTab.value.startsWith("shell:") && wt) {
    return `__shell:${wt}:${shellOverlayTab.value.slice("shell:".length)}`;
  }
  return visibleTerminalSessionId(activeThreadId.value, wt);
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
  activeThreadId,
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
  const wt = activeWorktreeId.value;
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

const repoDirectoryInput = ref<HTMLInputElement | null>(null);
let pendingRepoDirectoryResolve: ((value: string | null) => void) | null = null;
let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let disposeOpenWorkspaceSettings: (() => void) | null = null;

const scmBranchLine = computed(() => {
  const { shortLabel, branch } = scm.scmMeta;
  if (!branch) return null as string | null;
  return shortLabel ? `${shortLabel} / ${branch}` : branch;
});

const activeWorktreeHasThreads = computed(() => activeThreads.value.length > 0);

/** Files is always rooted at the accepted active worktree context. */
const fileExplorerWorktree = activeWorktree;

const activeWorktreePath = computed(() => activeWorktree.value?.path ?? null);

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

const scmHasStagedFiles = computed(() =>
  scm.repoStatus.some((e) => Boolean(e.stagedKind) && !e.isUntracked)
);

const scmSuggestCommitAvailable = computed(
  () =>
    Boolean(getApi()?.stagedUnifiedDiff) &&
    scm.hasGitRepository === true
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

async function syncRouteFromSnapshot(
  next: Pick<WorkspaceSnapshot, "activeProjectId" | "activeWorktreeId" | "activeThreadId">
): Promise<void> {
  if (!next.activeProjectId) {
    await router.replace({ name: "welcome" });
    return;
  }
  const wt = workspace.worktrees.find((w) => w.id === next.activeWorktreeId);
  if (!wt) {
    await router.replace({ name: "welcome" });
    return;
  }
  if (next.activeThreadId) {
    await router.replace({
      name: "thread",
      params: {
        projectId: next.activeProjectId,
        branch: encodeBranch(wt.branch),
        threadId: next.activeThreadId
      }
    });
  } else {
    await router.replace({
      name: "files",
      params: { projectId: next.activeProjectId, branch: encodeBranch(wt.branch) }
    });
  }
}

async function refreshSnapshot(snapshot?: WorkspaceSnapshot): Promise<void> {
  const api = getApi();
  if (!api) return;
  const next = snapshot ?? ((await api.getSnapshot()) as WorkspaceSnapshot);
  workspace.hydrate(next);
  await syncRouteFromSnapshot(next);
}


async function handleInitializeGit(): Promise<void> {
  const api = getApi();
  const cwd = activeWorktree.value?.path;
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
    await scm.refreshRepoStatus();
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
  await scm.refreshRepoStatus();
}

async function syncWorktrees(projectId: string): Promise<void> {
  const api = getApi();
  if (!api?.syncWorktrees) return;
  const snapshot = await api.syncWorktrees(projectId);
  if (snapshot) await refreshSnapshot(snapshot as WorkspaceSnapshot);
}

async function confirmFilesContextSwitch(nextWorktreeId: string | null): Promise<boolean> {
  const currentWorktreeId = activeWorktreeId.value;
  if (!currentWorktreeId || nextWorktreeId === currentWorktreeId) return true;

  const nextWorktreePath =
    workspace.worktrees.find((worktree) => worktree.id === nextWorktreeId)?.path ?? null;

  return (await fileSearchRef.value?.confirmContextSwitch?.(nextWorktreePath)) ?? true;
}

async function handleSelectProject(projectId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  await syncWorktrees(projectId);
  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) return;
  const worktree =
    workspace.worktrees.find(
      (w) => w.projectId === projectId && w.id === project.lastActiveWorktreeId
    ) ?? workspace.worktrees.find((w) => w.projectId === projectId && w.isDefault);
  if (!worktree) return;
  if (!(await confirmFilesContextSwitch(worktree.id))) return;
  const lastThreadId = worktree.lastActiveThreadId;
  const thread =
    (lastThreadId && workspace.threads.find((t) => t.id === lastThreadId)) ||
    workspace.threads.find((t) => t.worktreeId === worktree.id);
  if (api.setActive) {
    await api.setActive({ projectId, worktreeId: worktree.id, threadId: thread?.id ?? null });
  }
  await refreshSnapshot();
  await scm.refreshRepoStatus();
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
  await scm.refreshRepoStatus();
}

async function handleSelectWorktree(worktreeId: string): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  const targetWt = workspace.worktrees.find((w) => w.id === worktreeId);
  if (!targetWt) return false;
  if (activeWorktreeId.value === targetWt.id) return true;
  if (!(await confirmFilesContextSwitch(targetWt.id))) return false;
  const projectId = targetWt.projectId;
  const lastThreadId = targetWt.lastActiveThreadId;
  const thread =
    (lastThreadId && workspace.threads.find((t) => t.id === lastThreadId)) ||
    workspace.threads.find((t) => t.worktreeId === worktreeId);
  if (api.setActive) {
    await api.setActive({ projectId, worktreeId, threadId: thread?.id ?? null });
  }
  await refreshSnapshot();
  await scm.refreshRepoStatus();
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
  const sameAgentCount = activeThreads.value.filter((t) => t.agent === agent).length;
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
  const wasActive = activeThreadId.value === threadId;
  const nextThread = wasActive
    ? activeThreads.value.find((t) => t.id !== threadId) ?? null
    : null;
  workspace.removeThreadLocal(threadId);
  try {
    await api.ptyKill(threadId);
    const payload: DeleteThreadInput = { threadId };
    await api.deleteThread(payload);
    if (wasActive) {
      await api.setActive({
        projectId: activeProjectId.value,
        worktreeId: activeWorktreeId.value,
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
  const wt = activeWorktreeId.value;
  if (!wt) return;
  const draftId = loadInlineThreadDraft(wt);
  if (!draftId) return;
  if (!workspace.threads.some((t) => t.id === draftId)) {
    clearInlineThreadDraft(wt);
    return;
  }
  if (activeThreadId.value !== draftId) return;
  inlinePromptThreadId.value = draftId;
}

async function openInlineThreadPrompt(worktreeId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const projectId =
    activeProjectId.value ??
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
}

function openAddThreadFromToolbarOrEmpty(): void {
  const worktreeId = resolvePrimaryWorktreeId();
  if (!worktreeId) return;
  void openInlineThreadPrompt(worktreeId);
}

async function handleCreateWorktreeGroup(branch: string, baseBranch: string | null): Promise<void> {
  const api = getApi();
  const projectId = activeProjectId.value;
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
    const groupThreads = activeProjectThreads.value.filter((t) => t.worktreeId === worktreeId);
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


async function handleSelectThread(threadId: string): Promise<void> {
  const targetThread = workspace.threads.find((t) => t.id === threadId);
  if (!targetThread) return;
  const targetWt = workspace.worktrees.find((w) => w.id === targetThread.worktreeId);
  if (!targetWt) return;
  const projectId = targetThread.projectId;
  const api = getApi();
  if (!api) return;
  if (api.setActiveThread && targetThread.worktreeId === activeWorktreeId.value) {
    await api.setActiveThread(threadId);
  } else if (api.setActive) {
    if (!(await confirmFilesContextSwitch(targetThread.worktreeId))) return;
    await api.setActive({ projectId, worktreeId: targetWt.id, threadId });
  }
  await refreshSnapshot();
  await scm.refreshRepoStatus();
  clearPtyIdleAttention(threadId);
}

async function handleScmSuggestCommit(): Promise<void> {
  await localLlm.suggestFromStaged(activeWorktree.value?.path ?? null);
  if (localLlm.commitSuggestState === "ready" && localLlm.commitCandidates.length > 0) {
    scm.scmCommitMessage = localLlm.commitCandidates[0] ?? "";
  }
  if (localLlm.commitSuggestState === "error" && localLlm.commitSuggestError) {
    toast.error("Could not suggest commit", localLlm.commitSuggestError);
  }
}

async function handleScmOpenFileInEditor(path: string): Promise<void> {
  await navigateToCenterTab("files");
  await nextTick();
  await fileSearchRef.value?.openWorkspaceFile(path);
}

function handleConfigureCommands(): void {
  agentCommandsSettingsOpen.value = true;
}


function toggleThreadsSidebar(): void {
  threadsSidebarCollapsed.value = !threadsSidebarCollapsed.value;
}

function expandThreadsSidebar(): void {
  threadsSidebarCollapsed.value = false;
}

function resolvePrimaryWorktreeId(): string | null {
  const defaultId = defaultWorktree.value?.id ?? null;
  if (defaultId) return defaultId;
  const primaryContextId = threadContexts.value.find((context) => context.isDefault)?.worktreeId ?? null;
  if (primaryContextId) return primaryContextId;
  if (activeWorktreeId.value) return activeWorktreeId.value;
  return (
    workspace.worktrees.find((worktree) => worktree.projectId === activeProjectId.value)?.id ?? null
  );
}

const workspaceLauncherOpen = ref(false);

function openNewThreadMenuFromShortcut(): void {
  const worktreeId = resolvePrimaryWorktreeId();
  if (!worktreeId) return;
  void openInlineThreadPrompt(worktreeId);
}

function focusFileSearchShortcut(): void {
  void navigateToCenterTab("files");
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
      : activeWorktree.value;
  if (!targetWt) return;

  if (activeWorktreeId.value !== targetWt.id) {
    const switched = await handleSelectWorktree(targetWt.id);
    if (!switched) return;
  }

  await navigateToCenterTab("files");
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

const { goPrevThread, goNextThread, maybeSetResumeBootstrap } = useThreadNavigation(
  workspace,
  active,
  pendingAgentBootstrap
);

useWorktreeHealth(workspace, threadGroups, staleWorktreeIds);

useWorkspaceKeybindings(
  {
    workspaceUiActive: () => hasActiveWorkspace.value,
    settingsOpen: () => agentCommandsSettingsOpen.value,
    centerTab: () => mainCenterTab.value,
    shellSlotIds: () => shellSlotIds.value,
    terminalPanelOpen: () => terminalPanelOpen.value,
    scmActionsAvailable: () => scm.hasGitRepository === true,
    launcherConsumesNavShortcuts: () => workspaceLauncherOpen.value,
    onSelectCenterTab: (tab) => {
      if (tab === "agent" || tab === "diff" || tab === "files" || tab === "preview") {
        void navigateToCenterTab(tab);
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
      void scm.stageAll();
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
  const api = getApi();
  if (api) {
    await refreshSnapshot();
  }
  maybeSetResumeBootstrap(activeThreadId.value);
  if (activeProjectId.value) {
    await syncWorktrees(activeProjectId.value);
  }
  await scm.refreshRepoStatus();
  if (api?.onWorkspaceChanged) {
    disposeWorkspaceChanged = api.onWorkspaceChanged(() => {
      void refreshSnapshot();
    });
  }
  if (api?.onWorkingTreeFilesChanged) {
    disposeWorkingTreeFilesChanged = api.onWorkingTreeFilesChanged(() => {
      void scm.refreshRepoStatus();
    });
  }
  if (api?.onOpenWorkspaceSettings) {
    disposeOpenWorkspaceSettings = api.onOpenWorkspaceSettings(() => {
      handleConfigureCommands();
    });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onInlinePromptCmdEnter, { capture: true });
  disposeOpenWorkspaceSettings?.();
  disposeOpenWorkspaceSettings = null;
  disposeWorkspaceChanged?.();
  disposeWorkspaceChanged = null;
  disposeWorkingTreeFilesChanged?.();
  disposeWorkingTreeFilesChanged = null;
});

watch(
  () =>
    `${activeWorktreeId.value ?? ""}\0${activeThreadId.value ?? ""}\0${workspace.threads
      .map((t) => t.id)
      .sort()
      .join(",")}`,
  () => {
    tryRestoreInlineThreadDraft();
  },
  { immediate: true }
);

watch(
  () => workspace.threads.map((t) => t.id).join(","),
  () => {
    const currentThreadId = activeThreadId.value;
    if (!currentThreadId) return;
    if (route.name !== "thread") return;
    const stillExists = workspace.threads.some((t) => t.id === currentThreadId);
    if (stillExists) return;
    const fallback = workspace.threads.find((t) => t.worktreeId === activeWorktreeId.value);
    if (fallback && activeProjectId.value && activeBranch.value) {
      void router.replace({
        name: "thread",
        params: {
          projectId: activeProjectId.value,
          branch: encodeBranch(activeBranch.value),
          threadId: fallback.id
        }
      });
    } else if (activeProjectId.value && activeBranch.value) {
      void router.replace({
        name: "files",
        params: { projectId: activeProjectId.value, branch: encodeBranch(activeBranch.value) }
      });
    }
  }
);

watch(
  () => activeWorktreeId.value,
  async (wt, prev) => {
    if (!wt) {
      shellSlotIds.value = [];
      shellOverlayTab.value = "agent";
      void router.push({ name: "welcome" });
    } else if (prev !== wt) {
      const saved = loadTerminalLayout(wt);
      if (saved) {
        shellSlotIds.value = saved.shellSlotIds;
        const resolvedMain = resolveCenterTab(saved.centerTab, saved.shellSlotIds);
        if (resolvedMain.startsWith("shell:")) {
          void navigateToCenterTab("agent");
          shellOverlayTab.value = resolveShellOverlayTab(resolvedMain, saved.shellSlotIds);
        } else {
          void navigateToCenterTab(resolvedMain as "agent" | "diff" | "files" | "preview");
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
    await scm.refreshRepoStatus();
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
    activeWorktreeId
  ],
  () => {
    const wt = activeWorktreeId.value;
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
    if (tab === "diff") void scm.refreshRepoStatus();
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
  () => [mainCenterTab.value, scm.hasGitRepository] as const,
  ([tab, git]) => {
    // Only leave Git tab when we know there is no repo. While `null` (loading), switching away
    // fights async refresh and can contribute to recursive update / focus churn.
    if (tab === "diff" && git === false) {
      void navigateToCenterTab("agent");
    }
  },
  { flush: "post" }
);
</script>

<template>
  <main class="relative flex h-screen flex-col bg-background/50">
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
      :active-project-id="activeProjectId"
      :active-thread-id="activeThreadId"
      @select="handleSelectProject"
      @remove="handleRemoveProject"
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

    <section v-else class="relative flex min-h-0 flex-1 overflow-hidden">      
      <section
        class="absolute inset-y-0 left-0 z-20 flex w-[270px] min-h-0 min-w-0 flex-col overflow-hidden transition-all duration-300 ease-out"
        :class="
          threadsSidebarCollapsed
            ? 'pointer-events-none -translate-x-full opacity-0'
            : 'pointer-events-auto translate-x-0 opacity-100'
        "
      >
        <ThreadSidebar
          ref="threadSidebarRef"
          v-model:center-panel-tab="topCenterTabModel"
          class="min-h-0 min-w-0 flex-1 sidebar-glass border-r border-sidebar-border"
          :collapsed="threadsSidebarCollapsed"
          :context-label="activeContextLabel"
          :threads="activeProjectThreads"
          :active-thread-id="activeThreadId"
          :run-status-by-thread-id="ptyRunStatusByThreadId"
          :idle-attention-by-thread-id="ptyIdleAttentionByThreadId"
          :thread-groups="threadGroups"
          :thread-contexts="threadContexts"
          :default-worktree-id="defaultWorktree?.id ?? null"
          :stale-worktree-ids="staleWorktreeIds"
          :show-branch-picker="showBranchPicker"
          :project-id="activeProjectId"
          :inline-prompt-thread-id="inlinePromptThreadId"
          :show-toolbar-branch-switcher="showTopBarBranchSwitcher"
          :scm-branch-line="scmBranchLine"
          :scm-current-branch="scm.scmMeta.branch"
          :scm-cwd="activeWorktree?.path ?? ''"
          :show-terminal-sidebar-button="showThreadSidebarTerminalButton"
          :center-panel-tabs="topCenterPanelTabs"
          :context-queue-items="contextQueueItems"
          :context-queue-worktree-path="activeWorktreePath"
          :projects="workspace.projects"
          :project-tab-worktrees="workspace.worktrees"
          :project-tab-threads="workspace.threads"
          :active-project-id="activeProjectId"
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
          @branch-changed="void scm.refreshRepoStatus()"
          @context-queue-confirm="onContextQueueConfirmed"
          @context-queue-persist-draft="onContextQueuePersistDraft"
          @select-project="handleSelectProject"
          @remove-project="handleRemoveProject"
          @create-project="handleCreateProject"
          @configure-commands="handleConfigureCommands"
          @open-terminal-panel="openTerminalOverlayPanel"
        />
      </section>
      <section
        class="isolate overflow-hidden flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-muted transition-[margin] duration-300 ease-out"
        :class="threadsSidebarCollapsed ? 'ml-0' : 'ml-[270px]'"
      >
        <div
          v-if="activeWorktreeHasThreads && scm.hasGitRepository === false"
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
                      v-if="scm.hasGitRepository"
                      :context-label="activeContextLabel"
                      :project-id="activeProjectId"
                      :allow-scm-branch-switcher="!isInNonDefaultWorktree"
                      :suggest-commit-available="scmSuggestCommitAvailable"
                      :suggest-commit-disabled-reason="scmSuggestCommitDisabledReason"
                      :suggest-commit-busy="scmSuggestCommitBusy"
                      :suggest-commit-gpu-ok="localLlm.webGpuOk"
                      :suggest-commit-truncated="localLlm.lastStagedTruncated"
                      :show-thread-sidebar-expand="threadsSidebarCollapsed"
                      :active-thread-id="activeThreadId"
                      @expand-thread-sidebar="expandThreadsSidebar"
                      @suggest-commit="handleScmSuggestCommit"
                      @open-file-in-editor="handleScmOpenFileInEditor"
                    />
                  </div>
                  <div
                    v-show="mainCenterTab === 'files'"
                    data-testid="workspace-files-pane"
                    class="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    <FileSearchEditor
                      ref="fileSearchRef"
                      :worktree-id="fileExplorerWorktree?.id ?? null"
                      :worktree-path="fileExplorerWorktree?.path ?? null"
                      :active-thread-id="activeThreadId"
                      :show-thread-sidebar-expand="threadsSidebarCollapsed"
                      @expand-thread-sidebar="expandThreadsSidebar"
                    />
                  </div>
                  <div v-show="mainCenterTab === 'preview'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <PreviewPanel
                      :is-visible="mainCenterTab === 'preview'"
                      :show-thread-sidebar-expand="threadsSidebarCollapsed"
                      @expand-thread-sidebar="expandThreadsSidebar"
                    />
                  </div>
                  <div v-show="mainCenterTab === 'agent'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <Button
                      v-if="threadsSidebarCollapsed"
                      data-testid="thread-sidebar-expand-fixed"
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      class="fixed top-12 bg-muted left-4 z-40 rounded-full shadow-sm"
                      aria-label="Show thread sidebar"
                      title="Show thread sidebar"
                      @click="threadsSidebarCollapsed = false"
                    >
                      <PanelLeftOpen class="h-4 w-4" aria-hidden="true" />
                    </Button>
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
                      v-else-if="inlinePromptThreadId && activeThreadId === inlinePromptThreadId"
                      ref="inlinePromptEditorRef"
                      :worktree-id="activeWorktreeId ?? ''"
                      :worktree-path="activeWorktree?.path ?? null"
                      :thread-context-label="inlinePromptThreadContextLabel"
                      @submit="onInlinePromptSubmit"
                      @cancel="onInlinePromptCancel"
                    />
                    <TerminalPane
                      v-else
                      ref="agentTerminalPaneRef"
                      pty-kind="agent"
                      :worktree-id="activeWorktreeId ?? ''"
                      :thread-id="activeThreadId ?? ''"
                      :cwd="activeWorktree?.path ?? ''"
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
                          :worktree-id="activeWorktreeId ?? ''"
                          :thread-id="activeThreadId ?? ''"
                          :cwd="activeWorktree?.path ?? ''"
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
