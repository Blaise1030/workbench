import { MAX_THREAD_TITLE_CHARS, MAX_USER_MESSAGE_FOR_TITLE_CHARS } from "./constants";

export function buildThreadTitlePrompt(userMessage: string, agentLabel: string): string {
  const body =
    userMessage.length > MAX_USER_MESSAGE_FOR_TITLE_CHARS
      ? userMessage.slice(0, MAX_USER_MESSAGE_FOR_TITLE_CHARS)
      : userMessage;
  return [
    "You name a short UI title for a coding agent thread.",
    `Rules: reply with exactly one line, max ${MAX_THREAD_TITLE_CHARS} characters; no quotes; describe the user's task; agent context: ${agentLabel}.`,
    "User message:",
    body
  ].join("\n");
}
