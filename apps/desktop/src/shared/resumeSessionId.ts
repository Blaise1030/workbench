/**
 * Resume/session IDs we persist must match a canonical UUID string (RFC 4122 appearance):
 * 8-4-4-4-12 lowercase or uppercase hex, 36 characters total.
 * Example: cb1438da-39bb-4f7f-8108-510fe91963e1
 */
const RESUME_SESSION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RESUME_SESSION_ID_LENGTH = 36;

export function isValidResumeSessionId(id: string): boolean {
  const t = id.trim();
  return t.length === RESUME_SESSION_ID_LENGTH && RESUME_SESSION_ID_REGEX.test(t);
}
