const STORAGE_PREFIX = "instrument.terminalLayout";

function storageKey(worktreeId: string): string {
  return `${STORAGE_PREFIX}.${worktreeId}`;
}

export type TerminalLayoutState = {
  centerTab: string;
  shellSlotIds: string[];
};

export function loadTerminalLayout(worktreeId: string): TerminalLayoutState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(worktreeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { centerTab?: unknown; shellSlotIds?: unknown };
    if (typeof parsed.centerTab !== "string" || !Array.isArray(parsed.shellSlotIds)) {
      return null;
    }
    const shellSlotIds = parsed.shellSlotIds.filter((x): x is string => typeof x === "string");
    return { centerTab: parsed.centerTab, shellSlotIds };
  } catch {
    return null;
  }
}

export function saveTerminalLayout(worktreeId: string, state: TerminalLayoutState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(worktreeId), JSON.stringify(state));
  } catch {
    /* quota or private mode */
  }
}

/** Normalize a saved center tab against the current slot list. */
export function resolveCenterTab(centerTab: string, shellSlotIds: string[]): string {
  if (centerTab === "agent" || centerTab === "diff" || centerTab === "files") {
    return centerTab;
  }
  if (centerTab.startsWith("shell:")) {
    const slot = centerTab.slice("shell:".length);
    return shellSlotIds.includes(slot) ? centerTab : "agent";
  }
  return "agent";
}
