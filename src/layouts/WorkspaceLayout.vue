<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { PanelLeftOpen } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";
import DiffReviewPanel from "@/components/DiffReviewPanel.vue";
import PillTabs from "@/components/ui/PillTabs.vue";
import ProjectTabs from "@/components/ProjectTabs.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import { useToast } from "@/composables/useToast";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useRunStore } from "@/stores/runStore";
import type { ThreadAgent } from "@shared/domain";
import type {
  AddProjectInput,
  CreateThreadInput,
  DeleteThreadInput,
  RenameThreadInput,
  WorkspaceSnapshot
} from "@shared/ipc";

const workspace = useWorkspaceStore();
const runs = useRunStore();
const toast = useToast();
/** Sticky bar hint: single path or "N files" when multiple unstaged paths. */
const diffSummaryLabel = ref<string | null>(null);
const selectedDiff = ref("Diff preview will render here.");
const threadsVisible = ref(true);
const centerTab = ref<"terminal" | "diff">("terminal");
const centerPanelTabs = [
  { value: "terminal", label: "Terminal" },
  { value: "diff", label: "Git Diff" }
] as const;
const centerTabModel = computed({
  get: () => centerTab.value,
  set: (v: string) => {
    centerTab.value = v as "terminal" | "diff";
  }
});
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
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${label} · ${stamp}`;
}

async function handleCreateThreadWithAgent(agent: ThreadAgent): Promise<void> {
  centerTab.value = "terminal";
  const api = getApi();
  if (!api || !workspace.activeProjectId || !workspace.activeWorktreeId) return;
  const payload: CreateThreadInput = {
    projectId: workspace.activeProjectId,
    worktreeId: workspace.activeWorktreeId,
    title: defaultTitleForAgent(agent),
    agent
  };
  await api.createThread(payload);
  await refreshSnapshot();
}

async function handleRemoveThread(threadId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const wasActive = workspace.activeThreadId === threadId;
  const nextThread = wasActive
    ? workspace.activeThreads.find((t) => t.id !== threadId) ?? null
    : null;
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
}

async function handleRenameThread(threadId: string, newTitle: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const payload: RenameThreadInput = { threadId, title: newTitle };
  await api.renameThread(payload);
  await refreshSnapshot();
}

async function handleSelectThread(threadId: string): Promise<void> {
  centerTab.value = "terminal";
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


onMounted(async () => {
  await refreshSnapshot();
  await refreshChangedFiles();
});

watch(
  () => workspace.activeWorktreeId,
  async () => {
    await refreshChangedFiles();
  }
);
</script>

<template>
  <main class="relative flex h-screen flex-col">
    <div
      v-if="workspace.projects.length === 0"
      class="pointer-events-none absolute top-2 right-2 z-10"
    >
      <div class="pointer-events-auto">
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
      v-if="workspace.projects.length > 0"
      :projects="workspace.projects"
      :worktrees="workspace.worktrees"
      :active-project-id="workspace.activeProjectId"
      @select="handleSelectProject"
      @create="handleCreateProject"
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
      <ThreadSidebar
        v-if="threadsVisible"
        :threads="workspace.activeThreads"
        :active-thread-id="workspace.activeThreadId"
        :run-status-by-thread-id="runs.statusByThreadId"
        @create-with-agent="handleCreateThreadWithAgent"
        @select="handleSelectThread"
        @remove="handleRemoveThread"
        @rename="handleRenameThread"
        @collapse="threadsVisible = false"
      />
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
        <PillTabs v-model="centerTabModel" :tabs="centerPanelTabs" aria-label="Center panel" />
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div v-show="centerTab === 'terminal'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TerminalPane
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
  </main>
</template>
