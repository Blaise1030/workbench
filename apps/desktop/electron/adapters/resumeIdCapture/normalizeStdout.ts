/**
 * Strips ANSI SGR sequences and CR so matchers see stable text.
 * Callers should pass a rolling buffer tail (not a single PTY write), or matches can miss when
 * `--resume=` and the id are split across chunks.
 */
export function normalizeStdoutForResumeCapture(chunk: string): string {
  return chunk.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}
