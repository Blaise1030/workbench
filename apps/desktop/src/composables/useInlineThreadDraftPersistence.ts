const STORAGE_PREFIX = "instrument.inlineThreadDraft";

function storageKey(worktreeId: string): string {
  return `${STORAGE_PREFIX}.${worktreeId}`;
}

/** Remember which thread is in inline "add thread" compose mode (survives full UI refresh). */
export function saveInlineThreadDraft(worktreeId: string, threadId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(worktreeId), threadId);
  } catch {
    /* quota or private mode */
  }
}

export function clearInlineThreadDraft(worktreeId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(worktreeId));
  } catch {
    /* */
  }
}

export function loadInlineThreadDraft(worktreeId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(worktreeId));
    if (raw == null || raw === "") return null;
    return raw;
  } catch {
    return null;
  }
}
