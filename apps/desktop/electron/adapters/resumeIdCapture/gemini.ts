import { CLI_RESUME_ID_CAPTURE, collectQuotedCliMatches } from "./cliIdCapture.js";
import type { ResumeIdMatch } from "./types.js";

/** Google Gemini CLI — `gemini --resume <id>` / short `-r`. */
const GEMINI_CLI_RESUME = new RegExp(
  String.raw`\bgemini\s+(?:(?:--resume)[\s=]+|-r\s+)${CLI_RESUME_ID_CAPTURE}`,
  "gi"
);

export function geminiResumeMatches(normalized: string): ResumeIdMatch[] {
  return collectQuotedCliMatches(normalized, GEMINI_CLI_RESUME);
}
