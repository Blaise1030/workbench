import { CLI_RESUME_ID_CAPTURE, collectQuotedCliMatches } from "./cliIdCapture.js";
import type { ResumeIdMatch } from "./types.js";

/** Codex CLI uses `resume` as a subcommand, not `--resume`. */
const CODEX_RESUME_CLI = new RegExp(String.raw`\bcodex\s+resume\s+${CLI_RESUME_ID_CAPTURE}`, "gi");

export function codexResumeMatches(normalized: string): ResumeIdMatch[] {
  return collectQuotedCliMatches(normalized, CODEX_RESUME_CLI);
}
