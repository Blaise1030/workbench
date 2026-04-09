import { UUID_CAPTURE_GROUP } from "./constants.js";
import type { ResumeIdMatch } from "./types.js";

/**
 * Generic `/status`-style line (Gemini CLI, Claude Code, etc.):
 * `Session ID: <uuid>` with arbitrary space after the colon.
 */
const SESSION_ID_STATUS_LINE = new RegExp(
  String.raw`\bSession\s+ID\s*:\s*${UUID_CAPTURE_GROUP}\b`,
  "gi"
);

export function sessionIdStatusLineMatches(normalized: string): ResumeIdMatch[] {
  const out: ResumeIdMatch[] = [];
  for (const m of normalized.matchAll(SESSION_ID_STATUS_LINE)) {
    const id = m[1]?.trim() ?? "";
    if (!id || m.index === undefined) continue;
    out.push({ id, index: m.index });
  }
  return out;
}
