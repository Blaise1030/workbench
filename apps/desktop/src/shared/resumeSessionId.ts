/**
 * Resume/session IDs we persist must match a canonical UUID string (RFC 4122 appearance):
 * 8-4-4-4-12 lowercase or uppercase hex, 36 characters total.
 * Example: cb1438da-39bb-4f7f-8108-510fe91963e1
 */
const RESUME_SESSION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RESUME_SESSION_ID_LENGTH = 36;

const OPAQUE_RESUME_ID_MIN = 3;
const OPAQUE_RESUME_ID_MAX = 128;

/** Safe for unquoted use in `cursor agent --resume=<id>` (no spaces or shell metacharacters). */
function isValidOpaqueResumeSessionId(id: string): boolean {
  if (id.length < OPAQUE_RESUME_ID_MIN || id.length > OPAQUE_RESUME_ID_MAX) return false;
  return /^[A-Za-z0-9_.-]+$/.test(id);
}

export function isValidResumeSessionId(id: string): boolean {
  const t = id.trim();
  return t.length === RESUME_SESSION_ID_LENGTH && RESUME_SESSION_ID_REGEX.test(t);
}

/**
 * IDs we persist and replay for `--resume`: canonical UUIDs, or provider opaque tokens
 * (e.g. Cursor hook `SessionStart` / CLI output) that are safe to embed in a shell line.
 */
export function isValidPersistedResumeId(id: string): boolean {
  const t = id.trim();
  if (t.length === 0) return false;
  if (isValidResumeSessionId(t)) return true;
  return isValidOpaqueResumeSessionId(t);
}
