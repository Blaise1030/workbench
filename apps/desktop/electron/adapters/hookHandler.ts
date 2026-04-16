// electron/adapters/hookHandler.ts
import type { WorkspaceService } from "../services/workspaceService.js";
import type { HookEventBody } from "../services/hookServer.js";

export type NotificationKind = "done" | "needsReview" | "failed";
export type HookRunState = "running" | "done" | "needsReview" | "failed";

export interface HookHandlerDeps {
  workspaceService: WorkspaceService;
  onChanged: () => void;
  /** Called with the notification kind and the thread ID. Caller resolves project/title. */
  onNotification: (kind: NotificationKind, threadId: string) => void;
  /** Called whenever hook events imply a run-state transition (replaces PTY heuristics in renderer). */
  onRunStateChanged: (state: HookRunState, threadId: string) => void;
}

export function handleHookEvent(
  event: HookEventBody,
  threadId: string,
  deps: HookHandlerDeps
): void {
  const name = event.hook_event_name;
  if (typeof name !== "string" || !threadId) return;

  switch (name) {
    case "SessionStart": {
      const sessionId =
        typeof event.session_id === "string" ? event.session_id :
        typeof event.sessionId === "string" ? event.sessionId :
        typeof event.conversation_id === "string" ? event.conversation_id :
        typeof event.conversationId === "string" ? event.conversationId :
        null;
      if (typeof sessionId !== "string" || !sessionId) return;
      if (deps.workspaceService.captureResumeId(threadId, sessionId)) {
        deps.onChanged();
      }
      // Agent just started — mark thread as running so the sidebar shows the indicator.
      deps.onRunStateChanged("running", threadId);
      return;
    }

    case "UserPromptSubmit":
    case "BeforeAgent": {
      const prompt = event.prompt;
      if (typeof prompt !== "string" || !prompt) return;
      if (deps.workspaceService.maybeRenameThreadFromPrompt(threadId, prompt)) {
        deps.onChanged();
      }
      deps.onRunStateChanged("running", threadId);
      return;
    }

    case "Stop":
    case "AfterAgent": {
      // Phase 2 rename: if agent includes a suggested title, update the thread name.
      const suggestedTitle =
        typeof event.conversation_title === "string" ? event.conversation_title :
        typeof event.title === "string" ? event.title : null;
      if (suggestedTitle) {
        deps.workspaceService.renameThread(threadId, suggestedTitle);
        deps.onChanged();
      }
      deps.onNotification("done", threadId);
      deps.onRunStateChanged("done", threadId);
      return;
    }

    case "StopFailure": {
      deps.onNotification("failed", threadId);
      deps.onRunStateChanged("failed", threadId);
      return;
    }

    case "Notification": {
      const kind: NotificationKind =
        event.type === "permission_request" ? "needsReview" : "done";
      deps.onNotification(kind, threadId);
      deps.onRunStateChanged(kind, threadId);
      return;
    }
  }
}
