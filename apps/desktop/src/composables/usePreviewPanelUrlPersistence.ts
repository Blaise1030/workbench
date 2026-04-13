const STORAGE_PREFIX = "instrument.previewPanelUrl";

function storageKey(worktreeId: string): string {
  return `${STORAGE_PREFIX}.${worktreeId}`;
}

/** Last preview URL typed for this worktree (empty string if none). */
export function loadPreviewPanelUrl(worktreeId: string | null | undefined): string {
  if (!worktreeId || typeof localStorage === "undefined") return "";
  try {
    const raw = localStorage.getItem(storageKey(worktreeId));
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

/** Persist preview URL for this worktree; empty string removes the entry. */
export function savePreviewPanelUrl(worktreeId: string | null | undefined, url: string): void {
  if (!worktreeId || typeof localStorage === "undefined") return;
  try {
    const t = url.trim();
    if (!t) {
      localStorage.removeItem(storageKey(worktreeId));
      return;
    }
    localStorage.setItem(storageKey(worktreeId), t);
  } catch {
    /* quota / private mode */
  }
}
