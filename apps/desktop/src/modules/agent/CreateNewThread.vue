<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import ThreadInlinePromptEditor from "@/components/ThreadInlinePromptEditor.vue";
import { useAgentBootstrapCommands } from "@/composables/useAgentBootstrapCommands";
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import { decodeBranch, encodeBranch } from "@/router/branchParam";
import { stashPendingAgentBootstrap } from "@/lib/pendingAgentBootstrapSession";
import { useWorkspaceStore, worktreeBranchNameContextLabel } from "@/stores/workspaceStore";
import type { Thread, ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import type { DeleteThreadInput, WorkspaceSnapshot } from "@shared/ipc";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini"
};

const route = useRoute();
const router = useRouter();
const workspace = useWorkspaceStore();
const { bootstrapCommandLineWithPrompt } = useAgentBootstrapCommands();

const projectId = computed(() => route.params.projectId as string);
const branchParam = computed(() => route.params.branch as string);

const worktree = computed(() => {
  const pid = projectId.value;
  const branch = decodeBranch(branchParam.value);
  return workspace.worktrees.find((w) => w.projectId === pid && w.branch === branch) ?? null;
});

const threadContextLabel = computed(() =>
  worktree.value ? worktreeBranchNameContextLabel(worktree.value) : null
);

const draftThreadId = ref<string | null>(null);
const createError = ref<string | null>(null);
const ready = ref(false);
const submitted = ref(false);

function getApi() {
  return window.workspaceApi ?? null;
}

async function refreshWorkspace(): Promise<void> {
   const api = getApi();
  if (!api?.getSnapshot) return null;
  const snap = (await api.getSnapshot()) as WorkspaceSnapshot;
  return workspace.hydrate(snap);
}

function defaultTitleForAgent(agent: ThreadAgent): string {
  const label = THREAD_AGENT_LABELS[agent];
  const sameAgentCount = workspace.threads.filter((t) => t.agent === agent).length;
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

async function removeDraftThread(threadId: string): Promise<void> {
  const api = getApi();
  if (!api) return;
  const meta = await refreshWorkspace();
  const threadWt = workspace.threads.find((t) => t.id === threadId)?.worktreeId;
  const wasActive = meta?.activeThreadId === threadId;
  const nextThread =
    threadWt != null
      ? workspace.threads.find((t) => t.worktreeId === threadWt && t.id !== threadId) ?? null
      : null;
  workspace.removeThreadLocal(threadId);
  try {
    await api.ptyKill(threadId);
    const payload: DeleteThreadInput = { threadId };
    await api.deleteThread(payload);
    if (wasActive && projectId.value && threadWt) {
      await api.setActive({
        projectId: projectId.value,
        worktreeId: threadWt,
        threadId: nextThread?.id ?? null
      });
    }
    await refreshWorkspace();
  } catch {
    await refreshWorkspace();
  }
}

async function ensureDraftThread(): Promise<void> {
  const wt = worktree.value;
  const pid = projectId.value;
  const api = getApi();
  if (!wt || !pid || !api?.createThread) {
    createError.value = !wt ? "No workspace for this branch." : "Workspace is not available.";
    return;
  }
  try {
    await refreshWorkspace();
    const created = (await api.createThread({
      projectId: pid,
      worktreeId: wt.id,
      title: "New thread",
      agent: readPreferredThreadAgent()
    })) as Thread;
    if (!created?.id) {
      createError.value = "Could not create thread.";
      return;
    }
    draftThreadId.value = created.id;
    ready.value = true;
    await refreshWorkspace();
  } catch (e) {
    createError.value = e instanceof Error ? e.message : "Could not create thread.";
  }
}

void ensureDraftThread();

onBeforeUnmount(() => {
  if (submitted.value || !draftThreadId.value) return;
  void removeDraftThread(draftThreadId.value);
});

async function onCancel(): Promise<void> {
  const id = draftThreadId.value;
  if (id) await removeDraftThread(id);
  draftThreadId.value = null;
  const pid = projectId.value;
  const eb = branchParam.value;
  if (pid && eb) {
    await router.push({ name: "threadNew", params: { projectId: pid, branch: eb } });
  } else {
    router.back();
  }
}

async function onSubmit(payload: ThreadCreateWithAgentPayload): Promise<void> {
  const threadId = draftThreadId.value;
  if (!threadId) return;
  const { agent, prompt } = payload;
  const api = getApi();
  const localDraft = workspace.threads.find((t) => t.id === threadId);
  if (localDraft && localDraft.agent !== agent) {
    localDraft.agent = agent;
  }
  if (api?.updateThread) {
    try {
      await api.updateThread({ threadId, agent });
    } catch {
      /* non-fatal */
    }
  }
  const title = resolveNewThreadTitle(payload, agent);
  if (api && title !== "New thread") {
    try {
      await api.renameThread({ threadId, title });
    } catch {
      /* non-fatal */
    }
  }
  const boot: PendingAgentBootstrap = {
    threadId,
    command: bootstrapCommandLineWithPrompt(agent, prompt),
    mode: "prompt"
  };
  stashPendingAgentBootstrap(boot);
  submitted.value = true;
  await refreshWorkspace();
  const eb = encodeBranch(worktree.value?.branch ?? decodeBranch(branchParam.value));
  await router.replace({
    name: "agent",
    params: { projectId: projectId.value, branch: eb, threadId }
  });
}

function onSubmitError(e: unknown): void {
  toast.error("Could not start thread", e instanceof Error ? e.message : "Something went wrong.");
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div
      v-if="createError"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <p class="text-sm text-muted-foreground">{{ createError }}</p>
      <button
        type="button"
        class="text-sm font-medium text-primary underline-offset-4 hover:underline"
        @click="router.push({ name: 'welcome' })"
      >
        Back to workspace
      </button>
    </div>
    <div v-else-if="!ready" class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Preparing new thread…
    </div>
    <ThreadInlinePromptEditor
      v-else-if="draftThreadId && worktree"
      :worktree-id="worktree.id"
      :worktree-path="worktree.path"
      :thread-context-label="threadContextLabel"
      @submit="(p) => void onSubmit(p).catch(onSubmitError)"
      @cancel="() => void onCancel()"
    />
  </div>
</template>
