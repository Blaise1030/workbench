import type { RunStatus, ThreadAgent } from "./domain";

/**
 * Heuristic run-state detection from a PTY chunk, mirroring `electron/adapters/*CliAdapter.ts` `detectState`.
 * Used in the renderer to show sidebar status while the agent terminal is open.
 */
export function detectRunStateFromChunk(agent: ThreadAgent, chunk: string): RunStatus | null {
  switch (agent) {
    case "claude":
      if (/awaiting feedback|waiting for feedback|approval needed/i.test(chunk)) return "needsReview";
      if (/failed|error/i.test(chunk)) return "failed";
      if (/done|completed|finished/i.test(chunk)) return "done";
      return null;
    case "codex":
      if (/waiting for review|needs review/i.test(chunk)) return "needsReview";
      if (/failed|error/i.test(chunk)) return "failed";
      if (/done|completed|finished/i.test(chunk)) return "done";
      return null;
    case "cursor":
      if (/awaiting approval|waiting for approval|needs approval|approval needed|pending approval/i.test(chunk)) {
        return "needsReview";
      }
      if (/failed|error/i.test(chunk)) return "failed";
      if (/done|completed|finished/i.test(chunk)) return "done";
      return null;
    case "gemini":
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
    default: {
      const _exhaustive: never = agent;
      return _exhaustive;
    }
  }
}
