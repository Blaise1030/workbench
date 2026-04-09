import { CLI_RESUME_ID_CAPTURE, collectQuotedCliMatches } from "./cliIdCapture.js";
import { UUID_CAPTURE_GROUP } from "./constants.js";
import type { ResumeIdMatch } from "./types.js";

/** Claude Code CLI: `claude --resume <id>`, short `claude -r <id>`. */
const CLAUDE_CLI_RESUME = new RegExp(
  String.raw`\bclaude\s+(?:(?:--resume)[\s=]+|-r\s+)${CLI_RESUME_ID_CAPTURE}`,
  "gi"
);

/** JSONL / JSON output: `"session_id"` / `"sessionId"`. */
const CLAUDE_JSON_SESSION_FIELD = new RegExp(
  String.raw`"(?:session_id|sessionId)"\s*:\s*"${UUID_CAPTURE_GROUP}"`,
  "gi"
);

/** Claude Code stdout: CLI hints and JSON session fields (`Session ID:` is shared — see `sessionIdStatusLine.ts`). */
export function claudeResumeMatches(normalized: string): ResumeIdMatch[] {
  const out: ResumeIdMatch[] = collectQuotedCliMatches(normalized, CLAUDE_CLI_RESUME);

  for (const m of normalized.matchAll(CLAUDE_JSON_SESSION_FIELD)) {
    const id = m[1]?.trim() ?? "";
    if (!id || m.index === undefined) continue;
    out.push({ id, index: m.index });
  }

  return out;
}
