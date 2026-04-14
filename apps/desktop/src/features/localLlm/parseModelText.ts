import { COMMIT_CANDIDATE_COUNT, MAX_THREAD_TITLE_CHARS } from "./constants";

export function parseCommitCandidates(raw: string): string[] {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const lines = t
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[\).\s]+/, "").trim())
    .filter(Boolean);
  return lines.slice(0, COMMIT_CANDIDATE_COUNT);
}

export function parseThreadTitle(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const line = t.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const one = line.replace(/^["']|["']$/g, "");
  return one.length > MAX_THREAD_TITLE_CHARS ? one.slice(0, MAX_THREAD_TITLE_CHARS) : one;
}
