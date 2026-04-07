import type { AdapterRunState, AgentAdapter, AdapterStartInput } from "./types.js";

export class ClaudeCodeCliAdapter implements AgentAdapter {
  kind = "claude" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "claude", args: ["--cwd", input.cwd, input.prompt] };
  }

  detectState(chunk: string): AdapterRunState | null {
    if (/awaiting feedback|waiting for feedback|approval needed/i.test(chunk)) return "needsReview";
    if (/failed|error/i.test(chunk)) return "failed";
    if (/done|completed|finished/i.test(chunk)) return "done";
    return null;
  }
}
