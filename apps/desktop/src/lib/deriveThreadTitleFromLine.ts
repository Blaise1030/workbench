/** Mirrors main-process `deriveThreadTitleFromPrompt` for renderer-side thread titles. */
const MAX_DERIVED_TITLE_LENGTH = 68;

export function deriveThreadTitleFromLine(input: string): string | null {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const normalized = firstLine
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_DERIVED_TITLE_LENGTH) return normalized;

  const truncated = normalized.slice(0, MAX_DERIVED_TITLE_LENGTH - 3).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  const safe = lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated;
  return `${safe}...`;
}
