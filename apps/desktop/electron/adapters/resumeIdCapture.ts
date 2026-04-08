const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const JSON_SESSION_ID_RE = /"session_id"\s*:\s*"([^"]+)"/;
const LABEL_PATTERNS = [
  /session[_\s-]?id[:\s=]+([^\s"'`[\]{}|,]+)/i,
  /\bsession\s*:\s*([a-zA-Z0-9_-]{6,})/i,
  /chat[_\s-]?id[:\s=]+([^\s"'`[\]{}|,]+)/i,
  /conversation[_\s-]?id[:\s=]+([^\s"'`[\]{}|,]+)/i,
  /resum(?:e|ing)(?:\s+session)?[:\s]+([a-zA-Z0-9_-]{8,})/i,
];

/**
 * Extract a resumable session ID from a PTY output chunk.
 * Strips ANSI escape sequences before matching.
 * Returns the first plausible ID found, or null.
 */
export function extractResumeIdFromStdout(chunk: string): string | null {
  const trimmed = chunk.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

  const jsonMatch = JSON_SESSION_ID_RE.exec(trimmed);
  if (jsonMatch?.[1]) {
    const v = jsonMatch[1].trim();
    if (v.length >= 8) return v;
  }

  for (const re of LABEL_PATTERNS) {
    const m = re.exec(trimmed);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v.length >= 6) return v;
    }
  }

  const uuidMatch = UUID_RE.exec(trimmed);
  if (uuidMatch?.[0]) return uuidMatch[0];

  return null;
}
