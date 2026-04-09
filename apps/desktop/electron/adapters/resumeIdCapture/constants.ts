/** Scan this many trailing characters so PTY chunk splits still see `...--resume=<uuid>`. */
export const RESUME_CAPTURE_TAIL_CHARS = 48_000;

/**
 * Canonical UUID token for Claude Code `/status` and JSONL-style fields (Claude-only matchers).
 */
export const UUID_CAPTURE_GROUP =
  "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})";
