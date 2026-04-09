import type { ResumeIdMatch } from "./types.js";

/** Quoted or unquoted id after a CLI resume hint. */
export const CLI_RESUME_ID_CAPTURE = '(?:"([^"]*)"|\'([^\']*)\'|(\\S+))';

export function idFromQuotedCliMatch(m: RegExpMatchArray): string {
  return (m[1] ?? m[2] ?? m[3])?.trim() ?? "";
}

export function collectQuotedCliMatches(normalized: string, re: RegExp): ResumeIdMatch[] {
  const out: ResumeIdMatch[] = [];
  for (const m of normalized.matchAll(re)) {
    const id = idFromQuotedCliMatch(m);
    if (!id || m.index === undefined) continue;
    out.push({ id, index: m.index });
  }
  return out;
}
