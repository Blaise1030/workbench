import { watch, type Ref } from "vue";
import { useRouter } from "vue-router";
import { threadAgentResumeCommand } from "@shared/threadAgentBootstrap";
import { isValidPersistedResumeId } from "@shared/resumeSessionId";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import type { useWorkspaceStore } from "@/stores/workspaceStore";
import { encodeBranch } from "@/router/branchParam";

export function useThreadNavigation(
  workspace: ReturnType<typeof useWorkspaceStore>,
  active: ReturnType<typeof useActiveWorkspace>,
  pendingAgentBootstrap: Ref<PendingAgentBootstrap | null>
): {
  goPrevThread: () => void;
  goNextThread: () => void;
  maybeSetResumeBootstrap: (threadId: string | null) => void;
} {
  const router = useRouter();

  function maybeSetResumeBootstrap(threadId: string | null): void {
    if (!threadId) return;
    const thread = workspace.threads.find((t) => t.id === threadId);
    if (!thread) return;
    const session = workspace.threadSessionFor(threadId);
    if (
      !session?.resumeId ||
      session.status !== "resumable" ||
      !isValidPersistedResumeId(session.resumeId)
    )
      return;
    if (pendingAgentBootstrap.value?.threadId === threadId) return;
    pendingAgentBootstrap.value = {
      threadId,
      command: threadAgentResumeCommand(thread.agent, session.resumeId),
      mode: "resume"
    };
  }

  watch(
    () => active.activeThreadId.value,
    (id) => {
      const pending = pendingAgentBootstrap.value;
      if (pending && id !== pending.threadId) pendingAgentBootstrap.value = null;
      maybeSetResumeBootstrap(id);
    }
  );

  function goPrevThread(): void {
    const threads = active.activeThreads.value;
    const cur = active.activeThreadId.value;
    if (threads.length === 0) return;
    const i = cur ? threads.findIndex((t) => t.id === cur) : 0;
    const prev = i <= 0 ? threads.length - 1 : i - 1;
    const t = threads[prev];
    if (!t) return;
    const wt = workspace.worktrees.find((w) => w.id === t.worktreeId);
    if (!wt) return;
    void router.push({
      name: "agent",
      params: { projectId: t.projectId, branch: encodeBranch(wt.branch), threadId: t.id }
    });
  }

  function goNextThread(): void {
    const threads = active.activeThreads.value;
    const cur = active.activeThreadId.value;
    if (threads.length === 0) return;
    const i = cur ? threads.findIndex((t) => t.id === cur) : -1;
    const next = i < 0 || i >= threads.length - 1 ? 0 : i + 1;
    const t = threads[next];
    if (!t) return;
    const wt = workspace.worktrees.find((w) => w.id === t.worktreeId);
    if (!wt) return;
    void router.push({
      name: "agent",
      params: { projectId: t.projectId, branch: encodeBranch(wt.branch), threadId: t.id }
    });
  }

  return { goPrevThread, goNextThread, maybeSetResumeBootstrap };
}
