/** Collapses trailing separators and outer whitespace for duplicate detection. */
export function normalizeRepoPathForCompare(raw: string): string {
  return raw.trim().replace(/[/\\]+$/, "");
}

/** Folder display name from an absolute repo path (last segment). */
export function displayNameFromRepoPath(raw: string): string {
  const t = normalizeRepoPathForCompare(raw);
  const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  const base = i >= 0 ? t.slice(i + 1) : t;
  return base.trim() || t;
}
