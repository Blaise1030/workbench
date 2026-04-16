import type { AgentAdapter, AdapterStartInput } from "./types.js";

export class CodexCliAdapter implements AgentAdapter {
  kind = "codex" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "codex", args: ["--cwd", input.cwd, input.prompt] };
  }
}
