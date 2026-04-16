import type { AgentAdapter, AdapterStartInput } from "./types.js";

export class CursorCliAdapter implements AgentAdapter {
  kind = "cursor" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "cursor", args: ["agent", input.prompt] };
  }
}
