import type { AgentAdapter, AdapterStartInput } from "./types.js";

export class GeminiCliAdapter implements AgentAdapter {
  kind = "gemini" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    // PTY `cwd` is already the worktree; prompt is passed as a single argument.
    return { file: "gemini", args: ["--", input.prompt] };
  }
}
