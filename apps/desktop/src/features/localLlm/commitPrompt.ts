import { COMMIT_CANDIDATE_COUNT } from "./constants";

/**
 * System message sets the complete role + output contract.
 * Keeping it separate from the diff avoids the model echoing prompt labels.
 */
export function buildCommitSystemPrompt(): string {
  return [
    "You are a git commit message generator.",
    `Output exactly ${COMMIT_CANDIDATE_COUNT} short git commit subject lines — one per line, nothing else.`,
    "Rules:",
    "- Imperative mood (e.g. \"Add\", \"Fix\", \"Refactor\")",
    "- Max 72 characters per line",
    "- Optional conventional-commit scope when obvious (e.g. \"feat(auth): ...\")",
    "- No numbering, no bullets, no code fences, no explanations",
    "Example output:",
    "feat(scm): add commit message suggestions via local LLM",
    "fix(auth): handle missing token on logout",
    "refactor(ui): extract Button into shared component"
  ].join("\n");
}

/**
 * User message: just the diff as data with a single direct instruction.
 * Avoids labels like "Staged diff:" that small models tend to echo verbatim.
 */
export function buildCommitSuggestionPrompt(unifiedDiff: string, truncated: boolean): string {
  const truncNote = truncated ? "\n(diff was truncated — infer from visible changes only)" : "";
  return `${unifiedDiff}${truncNote}\n\nWrite ${COMMIT_CANDIDATE_COUNT} commit subject lines for the changes above.`;
}
