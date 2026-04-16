const STORAGE_PREFIX = "instrument.previewPanelUrl";
const DEVTOOLS_STORAGE_PREFIX = "instrument.previewPanelDevtoolsOpen";

function storageKey(worktreeId: string): string {
  return `${STORAGE_PREFIX}.${worktreeId}`;
}

function devtoolsStorageKey(worktreeId: string): string {
  return `${DEVTOOLS_STORAGE_PREFIX}.${worktreeId}`;
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

/** Persist whether preview embedded devtools should be open for this worktree. */
export function savePreviewPanelDevtoolsOpen(
  worktreeId: string | null | undefined,
  isOpen: boolean
): void {
  if (!worktreeId || typeof localStorage === "undefined") return;
  try {
    if (isOpen) {
      localStorage.setItem(devtoolsStorageKey(worktreeId), "1");
    } else {
      localStorage.removeItem(devtoolsStorageKey(worktreeId));
    }
  } catch {
    /* quota / private mode */
  }
}

/** Whether preview embedded devtools should be open for this worktree. */
export function loadPreviewPanelDevtoolsOpen(worktreeId: string | null | undefined): boolean {
  if (!worktreeId || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(devtoolsStorageKey(worktreeId)) === "1";
  } catch {
    return false;
  }
}
