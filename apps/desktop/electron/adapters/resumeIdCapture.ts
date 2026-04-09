/**
 * Matches `agent --resume=<id>` in CLI help / exit text (e.g. Cursor).
 * Strips ANSI SGR sequences first. If multiple matches exist, returns the last one (newest hint).
 */
export function extractResumeIdFromStdout(chunk: string): string | null {
  const trimmed = chunk.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  const re = /\bagent\s+--resume\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;

  let last: string | null = null;
  for (const m of trimmed.matchAll(re)) {
    const v = (m[1] ?? m[2] ?? m[3])?.trim() ?? "";
    if (v.length > 0) last = v;
  }
  return last;
}
