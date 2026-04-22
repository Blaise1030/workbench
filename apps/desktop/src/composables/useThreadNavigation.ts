import { watch, type Ref } from "vue";
import { threadAgentResumeCommand } from "@shared/threadAgentBootstrap";
import { isValidPersistedResumeId } from "@shared/resumeSessionId";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import type { useWorkspaceStore } from "@/stores/workspaceStore";

export function useThreadNavigation(
  workspace: ReturnType<typeof useWorkspaceStore>,
  pendingAgentBootstrap: Ref<PendingAgentBootstrap | null>,
  handleSelectThread: (threadId: string) => void | Promise<void>
): {
  goPrevThread: () => void;
  goNextThread: () => void;
} {
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

  watch(
    () => workspace.activeThreadId,
    (id) => {
      const pending = pendingAgentBootstrap.value;
      if (pending && id !== pending.threadId) pendingAgentBootstrap.value = null;
      maybeSetResumeBootstrap(id);
    }
  );

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

  return { goPrevThread, goNextThread, maybeSetResumeBootstrap };
}
