import { claudeResumeMatches } from "./claude.js";
import { codexResumeMatches } from "./codex.js";
import { cursorResumeMatches } from "./cursor.js";
import { geminiResumeMatches } from "./gemini.js";
import { normalizeStdoutForResumeCapture } from "./normalizeStdout.js";
import { sessionIdStatusLineMatches } from "./sessionIdStatusLine.js";
import type { ResumeIdMatch } from "./types.js";

/**
 * Scans normalized PTY output for resume/session hints from Cursor, Gemini, Codex, and Claude Code.
 * If multiple matches exist, returns the id with the **last** start index in the buffer (newest hint).
 */
export function extractResumeIdFromStdout(chunk: string): string | null {
  const trimmed = normalizeStdoutForResumeCapture(chunk);
  const matches: ResumeIdMatch[] = [
    ...cursorResumeMatches(trimmed),
    ...geminiResumeMatches(trimmed),
    ...codexResumeMatches(trimmed),
    ...claudeResumeMatches(trimmed),
    ...sessionIdStatusLineMatches(trimmed)
  ];
  if (matches.length === 0) return null;

  let best = matches[0]!;
  for (const m of matches) {
    if (m.index >= best.index) best = m;
  }
  return best.id;
}
