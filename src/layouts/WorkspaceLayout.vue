<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { Plus, Settings } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";
import SourceControlPanel from "@/components/SourceControlPanel.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import ProjectTabs from "@/components/ProjectTabs.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import AgentCommandsSettingsDialog from "@/components/AgentCommandsSettingsDialog.vue";
import FileSearchEditor from "@/components/FileSearchEditor.vue";
import WorkspaceLauncherModal from "@/components/WorkspaceLauncherModal.vue";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import { useAgentBootstrapCommands } from "@/composables/useAgentBootstrapCommands";
import {
  loadTerminalLayout,
  resolveCenterTab,
  saveTerminalLayout
} from "@/composables/useTerminalLayoutPersistence";
import { useTerminalAttentionSounds } from "@/composables/useTerminalAttentionSounds";
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";
import { useToast } from "@/composables/useToast";
import { useWorkspaceKeybindings } from "@/composables/useWorkspaceKeybindings";
import { formatShortcut, MOD_DIGIT_SLOT_CODES, titleWithShortcut } from "@/keybindings/registry";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useRunStore } from "@/stores/runStore";
import { visibleTerminalSessionId } from "@/terminal/attentionRules";
import type { Thread, ThreadAgent } from "@shared/domain";
import type {
  AddProjectInput,
  CreateThreadInput,
  DeleteThreadInput,
  FileDiffScope,
  ReorderThreadsInput,
  RepoScmSnapshot,
  RepoStatusEntry,
  RenameThreadInput,
  WorkspaceSnapshot
} from "@shared/ipc";
const workspace = useWorkspaceStore();
const { terminalNotificationsEnabled, terminalBellSound, terminalBackgroundOutputSound } =
  useTerminalSoundSettings();
const { commands, applySaved, bootstrapCommandFor } = useAgentBootstrapCommands();
const agentCommandsSettingsOpen = ref(false);
const runs = useRunStore();
const toast = useToast();
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
const selectedDiff = ref("");
const selectedDiffLoading = ref(false);
const diffCache = new Map<string, string>();

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
/** `agent` | `diff` | `shell:${uuid}` for each extra terminal. */
const centerTab = ref<string>("agent");
/** One UUID per integrated terminal tab (after Agent + Git Diff). */
const shellSlotIds = ref<string[]>([]);

const threadSidebarRef = ref<InstanceType<typeof ThreadSidebar> | null>(null);
const fileSearchRef = ref<InstanceType<typeof FileSearchEditor> | null>(null);
const workspaceLauncherOpen = ref(false);
const keybindingsEnabled = ref(true);

const projectDigitSlotCount = computed(() => Math.min(MOD_DIGIT_SLOT_CODES.length, workspace.projects.length));

const centerPanelTabs = computed<PillTabItem[]>(() => {
  const slots = shellSlotIds.value;
  const projectSlots = projectDigitSlotCount.value;
  const tabs: PillTabItem[] = [{ value: "agent", label: "🤖 Agent" }];
  if (hasGitRepository.value === true) {
    tabs.push({ value: "diff", label: "🌿 Git Diff" });
  }
  tabs.push({
    value: "files",
    label: "📄 Files",
    dividerAfter: true
  });
  tabs.push(
    ...slots.map((id, i) => {
      const slotIndex = projectSlots + i;
      return {
        value: `shell:${id}`,
        label: `💻 Terminal ${i + 1}`,
        closable: true,
        shortcutHint:
          slotIndex < MOD_DIGIT_SLOT_CODES.length
            ? formatShortcut({ mod: true, code: MOD_DIGIT_SLOT_CODES[slotIndex] })
            : undefined
      };
    })
  );
  return tabs;
});

const centerTabModel = computed({
  get: () => centerTab.value,
  set: (v: string) => {
    centerTab.value = v;
  }
});

/** Agent threads that got terminal attention (sound rules) while their PTY was not the visible session. */
const threadsNeedingAttention = ref<Set<string>>(new Set());

function markThreadNeedingAttention(sessionId: string): void {
  if (!workspace.threads.some((t) => t.id === sessionId)) return;
  const next = new Set(threadsNeedingAttention.value);
  next.add(sessionId);
  threadsNeedingAttention.value = next;
}

function clearAttentionForVisibleSession(visibleId: string | null): void {
  if (visibleId == null || !threadsNeedingAttention.value.has(visibleId)) return;
  const next = new Set(threadsNeedingAttention.value);
  next.delete(visibleId);
  threadsNeedingAttention.value = next;
}

/** PTY session id currently visible in the center panel, or `null` when Git Diff (or no session). */
const visiblePtySessionId = computed(() => {
  const tab = centerTab.value;
  const wt = workspace.activeWorktreeId;
  if (tab === "agent") {
    return visibleTerminalSessionId(workspace.activeThreadId, wt);
  }
  if (tab.startsWith("shell:") && wt) {
    return `__shell:${wt}:${tab.slice("shell:".length)}`;
  }
  return null;
});

watch(visiblePtySessionId, (vid) => clearAttentionForVisibleSession(vid), { flush: "sync" });

watch(
  () => workspace.threads.map((t) => t.id).join("\0"),
  () => {
    const allow = new Set(workspace.threads.map((t) => t.id));
    const filtered = [...threadsNeedingAttention.value].filter((id) => allow.has(id));
    if (filtered.length === threadsNeedingAttention.value.size) return;
    threadsNeedingAttention.value = new Set(filtered);
  }
);

/** Projects that have at least one thread with unviewed terminal attention. */
const projectIdsNeedingAttention = computed(() => {
  const next = new Set<string>();
  for (const t of workspace.threads) {
    if (threadsNeedingAttention.value.has(t.id)) {
      next.add(t.projectId);
    }
  }
  return next;
});

useTerminalAttentionSounds({
  visibleSessionId: visiblePtySessionId,
  notificationsEnabled: terminalNotificationsEnabled,
  bellEnabled: terminalBellSound,
  backgroundEnabled: terminalBackgroundOutputSound,
  onUnviewedAttention: markThreadNeedingAttention
});

function addShellTerminal(): void {
  const id = crypto.randomUUID();
  shellSlotIds.value = [...shellSlotIds.value, id];
  centerTab.value = `shell:${id}`;
}

const addTerminalWrapRef = ref<HTMLElement | null>(null);
const addTerminalTooltipHover = ref(false);
const addTerminalTooltipFocused = ref(false);
const addTerminalTooltipStyle = ref<Record<string, string>>({});
const addTerminalTooltipId = `add-terminal-tooltip-${useId().replace(/:/g, "_")}`;
const addTerminalTooltipText = titleWithShortcut("Add terminal", "addTerminal");
const showAddTerminalTooltip = computed(
  () => addTerminalTooltipHover.value || addTerminalTooltipFocused.value
);

function updateAddTerminalTooltipPosition(): void {
  const el = addTerminalWrapRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  addTerminalTooltipStyle.value = {
    left: `${Math.round(rect.left + rect.width / 2)}px`,
    top: `${Math.round(rect.bottom + 6)}px`,
    transform: "translateX(-50%)"
  };
}

let removeAddTerminalTooltipListeners: (() => void) | null = null;

function bindAddTerminalTooltipListeners(): void {
  removeAddTerminalTooltipListeners?.();
  const handler = (): void => {
    if (showAddTerminalTooltip.value) updateAddTerminalTooltipPosition();
  };
  window.addEventListener("resize", handler);
  window.addEventListener("scroll", handler, true);
  removeAddTerminalTooltipListeners = () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("scroll", handler, true);
  };
}

function unbindAddTerminalTooltipListeners(): void {
  removeAddTerminalTooltipListeners?.();
  removeAddTerminalTooltipListeners = null;
}

watch(showAddTerminalTooltip, (show) => {
  if (show) {
    void nextTick(() => {
      updateAddTerminalTooltipPosition();
      bindAddTerminalTooltipListeners();
    });
  } else {
    unbindAddTerminalTooltipListeners();
  }
});

async function onCenterTabClose(tabValue: string): Promise<void> {
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
  if (centerTab.value === tabValue) {
    centerTab.value = "agent";
  }
}

/** After creating a thread from the agent menu, run the agent’s bootstrap CLI once in that PTY. */
const pendingAgentBootstrap = ref<{ threadId: string; command: string } | null>(null);
const repoDirectoryInput = ref<HTMLInputElement | null>(null);
let pendingRepoDirectoryResolve: ((value: string | null) => void) | null = null;
let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let disposeOpenWorkspaceSettings: (() => void) | null = null;
/** Incremented per diff refresh; stale async results are ignored (rapid worktree switch / overlap). */
let diffRefreshSeq = 0;
let selectedDiffSeq = 0;

const layoutColumns = computed(() => {
  const threadsWidth = threadsSidebarCollapsed.value ? "3.5rem" : "260px";
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

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

const scmFetchAvailable = computed(() => Boolean(getApi()?.gitFetch));
const scmPushAvailable = computed(() => Boolean(getApi()?.gitPush));
const scmCommitAvailable = computed(() => Boolean(getApi()?.commitStaged));

async function refreshSnapshot(snapshot?: WorkspaceSnapshot): Promise<void> {
  const api = getApi();
  if (!api) return;
  const next = snapshot ?? ((await api.getSnapshot()) as WorkspaceSnapshot);
  workspace.hydrate(next);
}

function cacheKey(path: string, scope: FileDiffScope): string {
  return `${scope}:${path}`;
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

async function loadSelectedDiff(): Promise<void> {
  const api = getApi();
  const path = selectedScmPath.value;
  const scope = selectedScmScope.value;
  if (!api || !workspace.activeWorktree || !path || !scope) {
    selectedDiff.value = "";
    selectedDiffLoading.value = false;
    return;
  }
  const seq = ++selectedDiffSeq;
  const cwd = workspace.activeWorktree.path;
  const key = cacheKey(path, scope);
  const cached = diffCache.get(key);
  if (cached != null) {
    selectedDiff.value = cached;
    selectedDiffLoading.value = false;
    return;
  }
  selectedDiffLoading.value = true;
  try {
    const diff = await api.fileDiff(cwd, path, scope);
    if (seq !== selectedDiffSeq || workspace.activeWorktree?.path !== cwd) return;
    selectedDiff.value = diff;
    diffCache.set(key, diff);
    while (diffCache.size > 24) {
      const oldest = diffCache.keys().next().value;
      if (!oldest) break;
      diffCache.delete(oldest);
    }
  } catch (error) {
    if (seq !== selectedDiffSeq || workspace.activeWorktree?.path !== cwd) return;
    selectedDiff.value =
      error instanceof Error
        ? `Could not load diff: ${error.message}`
        : "Could not load diff.";
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
    selectedDiff.value = "";
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
      selectedDiff.value = "";
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
    await loadSelectedDiff();
  } catch (error) {
    if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
    repoStatus.value = [];
    scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
    const message = error instanceof Error ? error.message : "";
    if (/not a git repository/i.test(message)) {
      hasGitRepository.value = false;
      selectedScmPath.value = null;
      selectedScmScope.value = null;
      selectedDiff.value = "";
    } else {
      selectedDiff.value =
        error instanceof Error ? `Could not load source control status: ${error.message}` : "Could not load source control status.";
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
        "Folder picking only works in the Electron app. From the project root, run: `npm run dev:electron`"
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

async function handleSelectProject(projectId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const project = workspace.projects.find((entry) => entry.id === projectId);
  const fallbackWorktreeId =
    project?.lastActiveWorktreeId ??
    workspace.worktrees.find((worktree) => worktree.projectId === projectId)?.id ??
    null;
  const fallbackThreadId =
    workspace.worktrees.find((worktree) => worktree.id === fallbackWorktreeId)?.lastActiveThreadId ?? null;
  await api.setActive({ projectId, worktreeId: fallbackWorktreeId, threadId: fallbackThreadId });
  await refreshSnapshot();
  await refreshRepoStatus();
}

async function handleSelectWorktree(worktreeId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const targetWt = workspace.worktrees.find((w) => w.id === worktreeId);
  if (!targetWt || workspace.activeWorktreeId === targetWt.id) return;
  const firstThreadInWt = workspace.threads.find((t) => t.worktreeId === targetWt.id)?.id ?? null;
  await api.setActive({
    projectId: targetWt.projectId,
    worktreeId: targetWt.id,
    threadId: targetWt.lastActiveThreadId ?? firstThreadInWt
  });
  await refreshSnapshot();
  await refreshRepoStatus();
}

const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

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

async function handleCreateThreadWithAgent(agent: ThreadAgent): Promise<void> {
  centerTab.value = "agent";
  const api = getApi();
  if (!api || !workspace.activeProjectId || !workspace.activeWorktreeId) return;
  const payload: CreateThreadInput = {
    projectId: workspace.activeProjectId,
    worktreeId: workspace.activeWorktreeId,
    title: defaultTitleForAgent(agent),
    agent
  };
  const created = (await api.createThread(payload)) as Thread;
  if (created.id) {
    pendingAgentBootstrap.value = {
      threadId: created.id,
      command: bootstrapCommandFor(agent)
    };
  }
  await refreshSnapshot();
}

function onTerminalBootstrapConsumed(): void {
  pendingAgentBootstrap.value = null;
}

function onSaveAgentCommands(next: Record<ThreadAgent, string>): void {
  applySaved(next);
}

async function handleRemoveThread(threadId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
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
  const api = getApi();
  if (!api) return;
  const payload: RenameThreadInput = { threadId, title: newTitle };
  await api.renameThread(payload);
  await refreshSnapshot();
}

async function handleReorderThreads(orderedThreadIds: string[]): Promise<void> {
  const api = getApi();
  const worktreeId = workspace.activeWorktreeId;
  if (!api || !worktreeId) return;

  workspace.reorderThreadsLocal(worktreeId, orderedThreadIds);

  try {
    const payload: ReorderThreadsInput = { worktreeId, orderedThreadIds };
    await api.reorderThreads(payload);
    await refreshSnapshot();
  } catch {
    await refreshSnapshot();
  }
}

async function handleSelectThread(threadId: string): Promise<void> {
  centerTab.value = "agent";
  const api = getApi();
  if (!api) return;
  const snapshot = (await api.setActiveThread(threadId)) as WorkspaceSnapshot;
  await refreshSnapshot(snapshot);
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

async function handleSelectScmEntry(payload: { path: string; scope: "staged" | "unstaged" }): Promise<void> {
  selectedScmPath.value = payload.path;
  selectedScmScope.value = payload.scope;
  await loadSelectedDiff();
}

async function handleScmOpenFileInEditor(path: string): Promise<void> {
  centerTab.value = "files";
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

function openNewThreadMenuFromShortcut(): void {
  threadSidebarRef.value?.openNewThreadMenu();
}

function focusFileSearchShortcut(): void {
  centerTab.value = "files";
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
    await handleSelectWorktree(targetWt.id);
  }

  centerTab.value = "files";
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

useWorkspaceKeybindings(
  {
    workspaceUiActive: () => hasActiveWorkspace.value,
    settingsOpen: () => agentCommandsSettingsOpen.value,
    centerTab: () => centerTab.value,
    projectIds: () => workspace.projects.map((p) => p.id),
    shellSlotIds: () => shellSlotIds.value,
    scmActionsAvailable: () => hasGitRepository.value === true,
    launcherConsumesNavShortcuts: () => workspaceLauncherOpen.value,
    onSelectProject: (projectId) => {
      void handleSelectProject(projectId);
    },
    onSelectCenterTab: (tab) => {
      centerTab.value = tab;
    },
    onPrevThread: goPrevThread,
    onNextThread: goNextThread,
    onToggleSidebar: toggleThreadsSidebar,
    onOpenNewThreadMenu: openNewThreadMenuFromShortcut,
    onAddTerminal: addShellTerminal,
    onFocusFileSearch: focusFileSearchShortcut,
    onToggleWorkspaceLauncher: toggleWorkspaceLauncher,
    onStageAllDiff: () => {
      void handleStageAll();
    },
    onOpenSettings: handleConfigureCommands
  },
  keybindingsEnabled
);

onMounted(async () => {
  await refreshSnapshot();
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
});

onBeforeUnmount(() => {
  unbindAddTerminalTooltipListeners();
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
  }
);

watch(
  () => workspace.activeWorktreeId,
  async (wt, prev) => {
    if (!wt) {
      shellSlotIds.value = [];
      centerTab.value = "agent";
      hasGitRepository.value = null;
    } else if (prev !== wt) {
      hasGitRepository.value = null;
      const saved = loadTerminalLayout(wt);
      if (saved) {
        shellSlotIds.value = saved.shellSlotIds;
        centerTab.value = resolveCenterTab(saved.centerTab, saved.shellSlotIds);
      } else if (prev != null) {
        shellSlotIds.value = [];
        if (centerTab.value.startsWith("shell:")) {
          centerTab.value = "agent";
        }
      }
    }
    await refreshRepoStatus();
  },
  { immediate: true }
);

watch(
  [centerTab, shellSlotIds, () => workspace.activeWorktreeId],
  () => {
    const wt = workspace.activeWorktreeId;
    if (!wt) return;
    saveTerminalLayout(wt, {
      centerTab: centerTab.value,
      shellSlotIds: [...shellSlotIds.value]
    });
  },
  { deep: true }
);

watch(shellSlotIds, (ids) => {
  const tab = centerTab.value;
  if (!tab.startsWith("shell:")) return;
  const slotId = tab.slice("shell:".length);
  if (!ids.includes(slotId)) centerTab.value = "agent";
});

watch(
  () => centerTab.value,
  (tab, prevTab) => {
    if (tab === "diff") void refreshRepoStatus();
    if (tab === "files" && prevTab !== "files") {
      void nextTick(() => {
        fileSearchRef.value?.focusSearch?.();
      });
    }
  },
  { flush: "post" }
);

watch(
  () => [centerTab.value, hasGitRepository.value] as const,
  ([tab, git]) => {
    if (tab === "diff" && git !== true) {
      centerTab.value = "agent";
    }
  },
  { flush: "sync" }
);
</script>

<template>
  <main class="relative flex h-screen flex-col">
    <div
      v-if="workspace.projects.length === 0"
      class="pointer-events-none absolute top-2 right-2 z-10"
    >
      <div class="pointer-events-auto flex items-center gap-1">
        <BaseButton
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Settings"
          :title="titleWithShortcut('Settings', 'openSettings')"
          @click="handleConfigureCommands"
        >
          <Settings class="h-3.5 w-3.5" />
        </BaseButton>
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
      :thread-ids-needing-attention="threadsNeedingAttention"
      :active-project-id="workspace.activeProjectId"
      :project-ids-needing-attention="projectIdsNeedingAttention"
      @select="handleSelectProject"
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
      <BaseButton v-if="workspace.projects.length === 0" type="button" @click="handleCreateProject">
        Add workspace
      </BaseButton>
    </section>

    <section v-else class="grid min-h-0 flex-1" :style="{ gridTemplateColumns: layoutColumns }">
      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border">
        <ThreadSidebar
          ref="threadSidebarRef"
          class="min-h-0 min-w-0 flex-1"
          :collapsed="threadsSidebarCollapsed"
          :threads="workspace.activeThreads"
          :active-thread-id="workspace.activeThreadId"
          :run-status-by-thread-id="runs.statusByThreadId"
          :threads-needing-attention="threadsNeedingAttention"
          @create-with-agent="handleCreateThreadWithAgent"
          @select="handleSelectThread"
          @remove="handleRemoveThread"
          @rename="handleRenameThread"
          @reorder="handleReorderThreads"
          @collapse="threadsSidebarCollapsed = true"
          @expand="threadsSidebarCollapsed = false"
        />
      </section>
      <section class="flex min-h-0 min-w-0 flex-col border-r border-border">
        <ProjectTabs
          v-if="workspace.projects.length > 0"
          :projects="workspace.projects"
          :worktrees="workspace.worktrees"
          :threads="workspace.threads"
          :thread-ids-needing-attention="threadsNeedingAttention"
          :active-project-id="workspace.activeProjectId"
          :project-ids-needing-attention="projectIdsNeedingAttention"
          @select="handleSelectProject"
          @create="handleCreateProject"
          @configure-commands="handleConfigureCommands"
        />
        <div
          v-if="activeWorktreeHasThreads"
          class="flex min-h-10 min-w-0 shrink-0 items-center justify-start gap-1 overflow-hidden py-0.5 pr-1 pl-0.5"
        >
          <PillTabs
            v-model="centerTabModel"
            class="min-w-0 flex-1"
            :tabs="centerPanelTabs"
            aria-label="Center panel"
            @tab-close="onCenterTabClose"
          />
          <div
            ref="addTerminalWrapRef"
            class="inline-flex shrink-0 items-center"
            @mouseenter="
              addTerminalTooltipHover = true;
              updateAddTerminalTooltipPosition();
            "
            @mouseleave="addTerminalTooltipHover = false"
          >
            <BaseButton
              type="button"
              variant="outline"
              size="xs"
              class="shrink-0 border-border bg-transparent shadow-none hover:bg-muted/50 dark:border-input dark:bg-transparent dark:hover:bg-input/40"
              aria-label="Add terminal"
              :aria-describedby="showAddTerminalTooltip ? addTerminalTooltipId : undefined"
              @focus="addTerminalTooltipFocused = true; updateAddTerminalTooltipPosition()"
              @blur="addTerminalTooltipFocused = false"
              @click="addShellTerminal"
            >
              <span class="inline-flex items-center gap-1.5">
                <Plus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Add terminal</span>
              </span>
            </BaseButton>
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
                Initialize Git in this folder to use source control and the Git Diff tab.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 pl-9">
            <BaseButton v-if="getApi()?.initGitRepository" type="button" size="sm" @click="handleInitializeGit">
              Initialize Git
            </BaseButton>
            <p v-else class="text-xs text-muted-foreground">
              Run <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">git init</code> in the terminal
              in this workspace.
            </p>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <section
            v-if="!activeWorktreeHasThreads"
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
            <ThreadCreateButton
              data-testid="workspace-create-thread-empty-state"
              aria-label="Add thread"
              :title="titleWithShortcut('Add thread', 'newThreadMenu')"
              size="sm"
              @create-with-agent="handleCreateThreadWithAgent"
            >
              <span class="inline-flex items-center gap-2">
                <Plus class="h-4 w-4" />
                <span>Add thread</span>
              </span>
            </ThreadCreateButton>
          </section>
          <div
            v-else
            v-show="centerTab === 'agent'"
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TerminalPane
              pty-kind="agent"
              :worktree-id="workspace.activeWorktreeId ?? ''"
              :thread-id="workspace.activeThreadId ?? ''"
              :cwd="workspace.activeWorktree?.path ?? ''"
              :pending-agent-bootstrap="pendingAgentBootstrap"
              @bootstrap-consumed="onTerminalBootstrapConsumed"
            />
          </div>
          <div
            v-for="slotId in shellSlotIds"
            :key="slotId"
            v-show="centerTab === `shell:${slotId}`"
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TerminalPane
              pty-kind="shell"
              :shell-slot-id="slotId"
              :worktree-id="workspace.activeWorktreeId ?? ''"
              :thread-id="workspace.activeThreadId ?? ''"
              :cwd="workspace.activeWorktree?.path ?? ''"
            />
          </div>
          <div v-show="centerTab === 'diff'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SourceControlPanel
              v-if="hasGitRepository"
              v-model:commit-message="scmCommitMessage"
              :repo-status="repoStatus"
              :branch-line="scmBranchLine"
              :last-commit-subject="scmMeta.lastCommitSubject"
              :scm-fetch-available="scmFetchAvailable"
              :scm-push-available="scmPushAvailable"
              :scm-commit-available="scmCommitAvailable"
              :scm-fetch-busy="scmFetchBusy"
              :scm-push-busy="scmPushBusy"
              :scm-commit-busy="scmCommitBusy"
              :selected-path="selectedScmPath"
              :selected-scope="selectedScmScope"
              :selected-diff="selectedDiff"
              :diff-loading="selectedDiffLoading"
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
              @open-file-in-editor="handleScmOpenFileInEditor"
            />
          </div>
          <div
            v-show="centerTab === 'files'"
            data-testid="workspace-files-pane"
            class="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border"
          >
            <FileSearchEditor
              ref="fileSearchRef"
              :worktree-path="workspace.activeWorktree?.path ?? null"
              :worktree-label="workspace.activeWorktree?.name ?? null"
            />
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

    <AgentCommandsSettingsDialog v-model="agentCommandsSettingsOpen" :commands="commands" @save="onSaveAgentCommands" />

    <Teleport to="body">
      <div
        v-if="showAddTerminalTooltip && activeWorktreeHasThreads"
        :id="addTerminalTooltipId"
        data-testid="add-terminal-tooltip"
        role="tooltip"
        class="pointer-events-none fixed z-[200] max-w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-border bg-popover px-2 py-1.5 text-center text-xs font-medium text-popover-foreground shadow-md"
        :style="addTerminalTooltipStyle"
      >
        {{ addTerminalTooltipText }}
      </div>
    </Teleport>
  </main>
</template>
