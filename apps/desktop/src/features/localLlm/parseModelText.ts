import { COMMIT_CANDIDATE_COUNT, MAX_THREAD_TITLE_CHARS } from "./constants";

/** Patterns that indicate the model echoed prompt content rather than generating a commit message. */
const ECHO_PATTERNS = [
  /^diff\s+--git\b/i,
  /^---\s+a\//i,
  /^\+\+\+\s+b\//i,
  /^@@\s+-\d/,
  /^index\s+[0-9a-f]{6,}/i,
  /staged\s+diff/i,
  /^#\s+diff\s+truncated/i,
];

function looksLikeCommitSubject(line: string): boolean {
  if (line.length > 100) return false;
  for (const pat of ECHO_PATTERNS) {
    if (pat.test(line)) return false;
  }
  return true;
}

export function parseCommitCandidates(raw: string): string[] {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const lines = t
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*\d+[\).\s]+/, "") // strip leading numbers
        .replace(/^[\*\-]\s+/, "")      // strip leading bullets
        .trim()
    )
    .filter((l) => l.length > 0 && looksLikeCommitSubject(l));
  return lines.slice(0, COMMIT_CANDIDATE_COUNT);
}

export function parseThreadTitle(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const line = t.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const one = line.replace(/^["']|["']$/g, "");
  // Some model outputs prepend a provider label (e.g. "Claude Inquiry: ...");
  // strip that so sidebar renames keep only the task title.
  const withoutAgentPrefix = one.replace(
    /^(?:claude|cursor|codex|gemini)(?:\s+code)?\s+(?:inquiry|request|task)\s*:\s*/i,
    ""
  );
  const normalized = withoutAgentPrefix || one;
  return normalized.length > MAX_THREAD_TITLE_CHARS
    ? normalized.slice(0, MAX_THREAD_TITLE_CHARS)
    : normalized;
}
