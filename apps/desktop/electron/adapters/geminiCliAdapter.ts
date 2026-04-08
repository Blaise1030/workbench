import type { AdapterRunState, AgentAdapter, AdapterStartInput } from "./types.js";

/**
 * Gemini CLI — heuristic state detection from PTY chunks.
 * Tuned for google-gemini/gemini-cli style output (approval prompts, completion text).
 * Patterns may need updates as the CLI evolves.
 */
export class GeminiCliAdapter implements AgentAdapter {
  kind = "gemini" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    // PTY `cwd` is already the worktree; prompt is passed as a single argument.
    return { file: "gemini", args: [input.prompt] };
  }

  detectState(chunk: string): AdapterRunState | null {
    if (
      /awaiting approval|waiting for approval|needs approval|pending approval|requires approval|approval required|shall i proceed\??/i.test(
        chunk
      )
    ) {
      return "needsReview";
    }
    if (/failed|error/i.test(chunk)) return "failed";
    if (/done|completed|finished/i.test(chunk)) return "done";
    return null;
  }
}
