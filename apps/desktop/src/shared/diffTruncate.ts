/** Cap unified diff size for IPC and renderer (memory + Vue reactivity). */
export const MAX_UNIFIED_DIFF_CHARS = 2_000_000;

/** Per-side cap for merge-view documents (two sides share IPC budget). */
export const MAX_MERGE_SIDE_CHARS = 1_000_000;

export function truncateUnifiedDiff(unified: string, maxChars = MAX_UNIFIED_DIFF_CHARS): string {
  if (unified.length <= maxChars) return unified;
  const cut = unified.lastIndexOf("\n", maxChars);
  const safe = cut > maxChars * 0.85 ? cut : maxChars;
  return `${unified.slice(0, safe)}\n\n# Diff truncated (${unified.length.toLocaleString()} chars total). Use: git diff`;
}

export function truncateMergeDoc(text: string, maxChars = MAX_MERGE_SIDE_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf("\n", maxChars);
  const safe = cut > maxChars * 0.85 ? cut : maxChars;
  return `${text.slice(0, safe)}\n\n/* … truncated (${text.length.toLocaleString()} characters total) */`;
}
