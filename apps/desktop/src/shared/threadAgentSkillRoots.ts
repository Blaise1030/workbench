import type { ThreadAgent } from "./domain";

/**
 * Default directories to search for skill packages (`<name>/SKILL.md`) when resolving `/` skills.
 * Stored values may use `~`; expand with the user home inferred from the worktree path.
 */
export const THREAD_AGENT_SKILL_ROOT_DEFAULT: Record<ThreadAgent, string> = {
  claude: "~/.claude/skills",
  cursor: "~/.cursor/skills",
  codex: "~/.codex/skills",
  gemini: "~/.gemini/skills"
};
