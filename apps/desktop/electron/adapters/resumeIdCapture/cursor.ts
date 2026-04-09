import { CLI_RESUME_ID_CAPTURE, collectQuotedCliMatches } from "./cliIdCapture.js";
import type { ResumeIdMatch } from "./types.js";

/**
 * Cursor CLI: `cursor agent --resume=<id>`, `cursor --resume=<id>`.
 * Codex-style line: `agent --resume=<id>` (integrated-terminal hints).
 */
const CURSOR_CLI_RESUME = new RegExp(
  String.raw`\b(?:cursor|agent)\s+(?:(?:--resume)[\s=]+|-r\s+)${CLI_RESUME_ID_CAPTURE}`,
  "gi"
);

export function cursorResumeMatches(normalized: string): ResumeIdMatch[] {
  return collectQuotedCliMatches(normalized, CURSOR_CLI_RESUME);
}
