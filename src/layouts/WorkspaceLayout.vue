<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { PanelLeftOpen, Plus, Settings } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";
import DiffReviewPanel from "@/components/DiffReviewPanel.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import ProjectTabs from "@/components/ProjectTabs.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import AgentCommandsSettingsDialog from "@/components/AgentCommandsSettingsDialog.vue";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import { useAgentBootstrapCommands } from "@/composables/useAgentBootstrapCommands";
import { useTerminalAttentionSounds } from "@/composables/useTerminalAttentionSounds";
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";
import { useToast } from "@/composables/useToast";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useRunStore } from "@/stores/runStore";
import { visibleTerminalSessionId } from "@/terminal/attentionRules";
import type { Thread, ThreadAgent } from "@shared/domain";
import type {
  AddProjectInput,
  CreateThreadInput,
  DeleteThreadInput,
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
/** Sticky bar hint: single path or "N files" when multiple unstaged paths. */
const diffSummaryLabel = ref<string | null>(null);
const selectedDiff = ref("Diff preview will render here.");
const threadsVisible = ref(true);
/** `agent` | `diff` | `shell:${uuid}` for each extra terminal. */
const centerTab = ref<string>("agent");
/** One UUID per integrated terminal tab (after Agent + Git Diff). */
const shellSlotIds = ref<string[]>([]);

const centerPanelTabs = computed<PillTabItem[]>(() => {
  const slots = shellSlotIds.value;
  return [
    { value: "agent", label: "🤖 Agent" },
    { value: "diff", label: "🌿 Git Diff", dividerAfter: true },
    ...slots.map((id, i) => ({
      value: `shell:${id}`,
      label: `💻 Terminal ${i + 1}`,
      closable: true
    }))
  ];
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

const layoutColumns = computed(() => {
  const threadsWidth = threadsVisible.value ? "260px" : "44px";
  return `${threadsWidth} minmax(0, 1fr)`;
});

/** Main panels (threads, terminal, diff) require an active worktree path. */
const hasActiveWorkspace = computed(() => Boolean(workspace.activeWorktree));

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

function diffGitHunkCount(unified: string): number {
  return (unified.match(/^diff --git /gm) ?? []).length;
}

function firstPathFromUnifiedDiff(unified: string): string | null {
  const line = unified.split("\n").find((l) => l.startsWith("diff --git "));
  if (!line) return null;
  const i = line.lastIndexOf(" b/");
  if (i < 0) return null;
  let p = line.slice(i + 3);
  if (p.startsWith('"')) {
    const end = p.lastIndexOf('"');
    if (end > 0) p = p.slice(1, end);
  }
  return p;
}

/** Prefer one `git diff`; fall back per-file when main has no `diff:workingTree` handler or invoke fails. */
async function loadWorkingTreeUnifiedDiff(api: WorkspaceApi, cwd: string, files: string[]): Promise<string> {
  if (api.workingTreeDiff) {
    try {
      return await api.workingTreeDiff(cwd);
    } catch {
      /* older Electron main or IPC mismatch */
    }
  }
  return (await Promise.all(files.map((f) => api.fileDiff(cwd, f))))
    .filter((chunk) => chunk.trim())
    .join("\n");
}

async function refreshSnapshot(snapshot?: WorkspaceSnapshot): Promise<void> {
  const api = getApi();
  if (!api) return;
  const next = snapshot ?? ((await api.getSnapshot()) as WorkspaceSnapshot);
  workspace.hydrate(next);
}

async function refreshChangedFiles(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) {
    diffSummaryLabel.value = null;
    selectedDiff.value = "Diff preview will render here.";
    return;
  }
  try {
    const files = await api.changedFiles(workspace.activeWorktree.path);
    if (!files.length) {
      diffSummaryLabel.value = null;
      selectedDiff.value = "No unstaged changes.";
      return;
    }
    const cwd = workspace.activeWorktree.path;
    const unified = await loadWorkingTreeUnifiedDiff(api, cwd, files);
    const body = unified.trim() ? unified : "No unstaged changes.";
    const shown = unified.trim() ? diffGitHunkCount(unified) : 0;
    const label =
      shown > 1
        ? `${shown} files`
        : shown === 1
          ? firstPathFromUnifiedDiff(unified) ?? files[0]!
          : files.length === 1
            ? files[0]!
            : `${files.length} files`;
    diffSummaryLabel.value = label;
    selectedDiff.value = body;
  } catch (error) {
    diffSummaryLabel.value = null;
    selectedDiff.value =
      error instanceof Error
        ? `Could not load diff: ${error.message}`
        : "Could not load diff.";
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
  await refreshChangedFiles();
}

async function handleSelectProject(projectId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const nextWorktree = workspace.worktrees.find((w) => w.projectId === projectId);
  await api.setActive({ projectId, worktreeId: nextWorktree?.id ?? null, threadId: null });
  await refreshSnapshot();
  await refreshChangedFiles();
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

async function handleSelectThread(threadId: string): Promise<void> {
  centerTab.value = "agent";
  const api = getApi();
  if (!api) return;
  const snapshot = (await api.setActiveThread(threadId)) as WorkspaceSnapshot;
  await refreshSnapshot(snapshot);
}

async function handleStageAll(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) return;
  await api.stageAll(workspace.activeWorktree.path);
  await refreshChangedFiles();
}

async function handleDiscardAll(): Promise<void> {
  const api = getApi();
  if (!api || !workspace.activeWorktree) return;
  const confirmed = window.confirm("Discard all changes in this worktree?");
  if (!confirmed) return;
  await api.discardAll(workspace.activeWorktree.path);
  await refreshChangedFiles();
}

function handleConfigureCommands(): void {
  agentCommandsSettingsOpen.value = true;
}

onMounted(async () => {
  await refreshSnapshot();
  await refreshChangedFiles();
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
    } else if (prev != null && wt !== prev) {
      shellSlotIds.value = [];
      if (centerTab.value.startsWith("shell:")) {
        centerTab.value = "agent";
      }
    }
    await refreshChangedFiles();
  },
  { immediate: true }
);

watch(shellSlotIds, (ids) => {
  const tab = centerTab.value;
  if (!tab.startsWith("shell:")) return;
  const slotId = tab.slice("shell:".length);
  if (!ids.includes(slotId)) centerTab.value = "agent";
});
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
          title="Settings"
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
      <section
        v-if="threadsVisible"
        class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border"
      >
        <ThreadSidebar
          class="min-h-0 min-w-0 flex-1"
          :threads="workspace.activeThreads"
          :active-thread-id="workspace.activeThreadId"
          :run-status-by-thread-id="runs.statusByThreadId"
          :threads-needing-attention="threadsNeedingAttention"
          @create-with-agent="handleCreateThreadWithAgent"
          @select="handleSelectThread"
          @remove="handleRemoveThread"
          @rename="handleRenameThread"
          @collapse="threadsVisible = false"
        />
      </section>
      <section v-else class="flex h-full items-start justify-center border-r border-border px-1 py-2">
        <BaseButton
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Expand threads sidebar"
          title="Expand threads sidebar"
          @click="threadsVisible = true"
        >
          <PanelLeftOpen class="h-3.5 w-3.5" />
        </BaseButton>
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
          class="flex min-h-10 min-w-0 shrink-0 items-center justify-start gap-1 py-0.5 pr-1 pl-0.5"
        >
          <PillTabs
            v-model="centerTabModel"
            :tabs="centerPanelTabs"
            aria-label="Center panel"
            @tab-close="onCenterTabClose"
          />
          <BaseButton
            v-if="shellSlotIds.length === 0"
            type="button"
            variant="outline"
            size="xs"
            class="shrink-0"
            aria-label="Add terminal"
            title="Add terminal"
            @click="addShellTerminal"
          >
            Add terminal
          </BaseButton>
          <BaseButton
            v-else
            type="button"
            variant="outline"
            size="icon-xs"
            class="shrink-0"
            aria-label="Add terminal"
            title="Add terminal"
            @click="addShellTerminal"
          >
            <Plus class="h-3.5 w-3.5" />
          </BaseButton>
        </div>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div v-show="centerTab === 'agent'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
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
            <DiffReviewPanel
              :summary-label="diffSummaryLabel"
              :selected-diff="selectedDiff"
              @stage-all="handleStageAll"
              @discard-all="handleDiscardAll"
            />
          </div>
        </div>
      </section>
    </section>

    <AgentCommandsSettingsDialog
      :open="agentCommandsSettingsOpen"
      :commands="commands"
      @update:open="agentCommandsSettingsOpen = $event"
      @save="onSaveAgentCommands"
    />
  </main>
</template>
