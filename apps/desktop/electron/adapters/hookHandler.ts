// electron/adapters/hookHandler.ts
import type { WorkspaceService } from "../services/workspaceService.js";
import type { HookEventBody } from "../services/hookServer.js";

export type NotificationKind = "done" | "needsReview" | "failed";

export interface HookHandlerDeps {
  workspaceService: WorkspaceService;
  onChanged: () => void;
  /** Called with the notification kind and the thread ID. Caller resolves project/title. */
  onNotification: (kind: NotificationKind, threadId: string) => void;
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
      const sessionId = event.session_id;
      if (typeof sessionId !== "string" || !sessionId) return;
      if (deps.workspaceService.captureResumeId(threadId, sessionId)) {
        deps.onChanged();
      }
      return;
    }

    case "UserPromptSubmit":
    case "BeforeAgent": {
      const prompt = event.prompt;
      if (typeof prompt !== "string" || !prompt) return;
      if (deps.workspaceService.maybeRenameThreadFromPrompt(threadId, prompt)) {
        deps.onChanged();
      }
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
      return;
    }

    case "StopFailure": {
      deps.onNotification("failed", threadId);
      return;
    }

    case "Notification": {
      const kind: NotificationKind =
        event.type === "permission_request" ? "needsReview" : "done";
      deps.onNotification(kind, threadId);
      return;
    }
  }
}
