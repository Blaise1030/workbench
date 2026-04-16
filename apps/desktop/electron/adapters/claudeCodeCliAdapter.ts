import type { AgentAdapter, AdapterStartInput } from "./types.js";

export class ClaudeCodeCliAdapter implements AgentAdapter {
  kind = "claude" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "claude", args: ["--cwd", input.cwd, "--", input.prompt] };
  }
}
