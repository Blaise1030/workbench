import type { AdapterRunState, AgentAdapter, AdapterStartInput } from "./types.js";

export class CodexCliAdapter implements AgentAdapter {
  kind = "codex" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "codex", args: ["--cwd", input.cwd, input.prompt] };
  }

  detectState(chunk: string): AdapterRunState | null {
    if (/waiting for review|needs review/i.test(chunk)) return "needsReview";
    if (/failed|error/i.test(chunk)) return "failed";
    if (/done|completed|finished/i.test(chunk)) return "done";
    return null;
  }
}
