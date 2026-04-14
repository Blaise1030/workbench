import { COMMIT_CANDIDATE_COUNT } from "./constants";

export function buildCommitSuggestionPrompt(unifiedDiff: string, truncated: boolean): string {
  const warn = truncated
    ? "\nNote: The diff was truncated for size. Infer only from the visible portion.\n"
    : "";
  return [
    "You suggest git commit messages.",
    "Rules: imperative mood; one subject line per suggestion (max 72 chars); optional scope in conventional style if obvious.",
    `Return exactly ${COMMIT_CANDIDATE_COUNT} subject lines, one per line, no numbering, no code fences, no extra prose.`,
    warn,
    "Staged diff:",
    unifiedDiff
  ].join("\n");
}
