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

function extractSessionIdFromHookEvent(event: HookEventBody): string | null {
  const candidates: unknown[] = [
    event.session_id,
    event.sessionId,
    event.conversation_id,
    event.conversationId,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function normalizeHookTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const singleLine = raw
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return singleLine.length > 0 ? singleLine : null;
}

function extractHookSuggestedTitle(event: HookEventBody): string | null {
  const direct =
    normalizeHookTitle(event.conversation_title) ??
    normalizeHookTitle(event.conversationTitle) ??
    normalizeHookTitle(event.thread_title) ??
    normalizeHookTitle(event.threadTitle) ??
    normalizeHookTitle(event.chat_title) ??
    normalizeHookTitle(event.chatTitle) ??
    normalizeHookTitle(event.title);
  if (direct) return direct;

  // Some providers nest title fields under `conversation`, `session`, `result`, or `payload`.
  const candidates = [event.payload, event.result, event.conversation, event.session, event.data];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const nested = candidate as Record<string, unknown>;
    const title =
      normalizeHookTitle(nested.conversation_title) ??
      normalizeHookTitle(nested.conversationTitle) ??
      normalizeHookTitle(nested.thread_title) ??
      normalizeHookTitle(nested.threadTitle) ??
      normalizeHookTitle(nested.chat_title) ??
      normalizeHookTitle(nested.chatTitle) ??
      normalizeHookTitle(nested.title) ??
      normalizeHookTitle((nested.conversation as Record<string, unknown> | undefined)?.title) ??
      normalizeHookTitle((nested.session as Record<string, unknown> | undefined)?.title);
    if (title) return title;
  }

  return null;
}

function readStringField(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tryPromptFromMessagesArray(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || typeof m !== "object") continue;
    const row = m as Record<string, unknown>;
    const role = row.role;
    if (role !== "user" && role !== "human") continue;
    const content = row.content;
    if (typeof content === "string") {
      const p = readStringField(content);
      if (p) return p;
    }
    if (Array.isArray(content)) {
      const textParts: string[] = [];
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") textParts.push(p.text);
      }
      const joined = readStringField(textParts.join("\n"));
      if (joined) return joined;
    }
  }
  return null;
}

function extractPromptFromRecord(rec: Record<string, unknown>): string | null {
  const fromStrings =
    readStringField(rec.prompt) ??
    readStringField(rec.input) ??
    readStringField(rec.user_prompt) ??
    readStringField(rec.userPrompt) ??
    readStringField(rec.chat_prompt) ??
    readStringField(rec.chatPrompt) ??
    readStringField(rec.message) ??
    readStringField(rec.text) ??
    readStringField(rec.content) ??
    readStringField(rec.user_message) ??
    readStringField(rec.userMessage) ??
    readStringField(rec.query) ??
    readStringField(rec.instruction);
  if (fromStrings) return fromStrings;
  return tryPromptFromMessagesArray(rec.messages);
}

function extractPromptFromObject(event: HookEventBody): string | null {
  const top = extractPromptFromRecord(event as Record<string, unknown>);
  if (top) return top;

  const nestedContainers = [event.payload, event.data, event.params, event.body];
  for (const nested of nestedContainers) {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const nestedPrompt = extractPromptFromRecord(nested as Record<string, unknown>);
    if (nestedPrompt) return nestedPrompt;
  }

  return tryPromptFromMessagesArray(event.messages);
}

function applySuggestedTitleFromHook(
  event: HookEventBody,
  threadId: string,
  deps: HookHandlerDeps
): void {
  const suggestedTitle = extractHookSuggestedTitle(event);
  if (!suggestedTitle) return;
  const currentTitle = deps.workspaceService
    .getSnapshot()
    .threads.find((thread) => thread.id === threadId)?.title
    ?.trim();
  if (currentTitle === suggestedTitle) return;
  deps.workspaceService.renameThread(threadId, suggestedTitle);
  deps.onChanged();
}

export function handleHookEvent(
  event: HookEventBody,
  threadId: string,
  deps: HookHandlerDeps
): void {
  const name = event.hook_event_name;
  if (typeof name !== "string" || !threadId) return;
  const lowerName = name.toLowerCase();
  const sessionId = extractSessionIdFromHookEvent(event);
  if (sessionId && deps.workspaceService.captureResumeId(threadId, sessionId)) {
    deps.onChanged();
  }

  switch (name) {
    case "SessionStart": {
      return;
    }

    case "UserPromptSubmit":
    case "BeforeAgent": {
      const prompt = extractPromptFromObject(event);
      if (!prompt) return;
      if (deps.workspaceService.maybeRenameThreadFromPrompt(threadId, prompt)) {
        deps.onChanged();
      }
      deps.onRunStateChanged("running", threadId);
      return;
    }

    case "Stop":
    case "AfterAgent": {
      applySuggestedTitleFromHook(event, threadId, deps);
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

    case "ConversationTitle":
    case "SessionTitle":
    case "ThreadTitle": {
      applySuggestedTitleFromHook(event, threadId, deps);
      return;
    }
  }

  // Provider-specific title events may use non-standard names (e.g. `conversation_title_updated`).
  if (lowerName.includes("title")) {
    applySuggestedTitleFromHook(event, threadId, deps);
  }
}
