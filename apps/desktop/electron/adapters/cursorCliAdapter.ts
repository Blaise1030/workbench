import type { AdapterRunState, AgentAdapter, AdapterStartInput } from "./types.js";

/**
 * Cursor CLI (`cursor agent …`) — heuristic state detection from PTY chunks.
 * Matches common status lines such as "Waiting for approval" from the agent CLI.
 * Patterns may need updates as the CLI evolves.
 */
export class CursorCliAdapter implements AgentAdapter {
  kind = "cursor" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "cursor", args: ["agent", input.prompt] };
  }

  detectState(chunk: string): AdapterRunState | null {
    if (
      /awaiting approval|waiting for approval|needs approval|approval needed|pending approval/i.test(chunk)
    ) {
      return "needsReview";
    }
    if (/failed|error/i.test(chunk)) return "failed";
    if (/done|completed|finished/i.test(chunk)) return "done";
    return null;
  }
}
