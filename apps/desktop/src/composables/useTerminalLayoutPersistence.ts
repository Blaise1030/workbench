const STORAGE_PREFIX = "instrument.terminalLayout";

function storageKey(worktreeId: string): string {
  return `${STORAGE_PREFIX}.${worktreeId}`;
}

export type TerminalLayoutState = {
  /** Main center column: `agent` | `diff` | `files` | `preview`. Legacy saves may store `shell:uuid` here — migrate on load. */
  centerTab: string;
  /** Which session is selected in the lower terminal overlay: `agent` or `shell:uuid`. Optional for backward compatibility. */
  shellOverlayTab?: string;
  shellSlotIds: string[];
  /** When false, integrated terminal dock is collapsed (⌘J / Ctrl+J toggles). */
  terminalPanelOpen?: boolean;
  /** Fixed pixel height of the terminal overlay panel. */
  terminalPanelHeightPx?: number;
};

export function loadTerminalLayout(worktreeId: string): TerminalLayoutState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(worktreeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      centerTab?: unknown;
      shellOverlayTab?: unknown;
      shellSlotIds?: unknown;
      terminalPanelOpen?: unknown;
      terminalPanelHeightPx?: unknown;
    };
    if (typeof parsed.centerTab !== "string" || !Array.isArray(parsed.shellSlotIds)) {
      return null;
    }
    const shellSlotIds = parsed.shellSlotIds.filter((x): x is string => typeof x === "string");
    const terminalPanelOpen =
      typeof parsed.terminalPanelOpen === "boolean" ? parsed.terminalPanelOpen : undefined;
    const terminalPanelHeightPx =
      typeof parsed.terminalPanelHeightPx === "number" &&
      Number.isFinite(parsed.terminalPanelHeightPx)
        ? parsed.terminalPanelHeightPx
        : undefined;
    const shellOverlayTab =
      typeof parsed.shellOverlayTab === "string" ? parsed.shellOverlayTab : undefined;
    return {
      centerTab: parsed.centerTab,
      shellOverlayTab,
      shellSlotIds,
      terminalPanelOpen,
      terminalPanelHeightPx
    };
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
  if (centerTab === "agent" || centerTab === "diff" || centerTab === "files" || centerTab === "preview") {
    return centerTab;
  }
  if (centerTab.startsWith("shell:")) {
    const slot = centerTab.slice("shell:".length);
    return shellSlotIds.includes(slot) ? centerTab : "agent";
  }
  return "agent";
}

/** Normalize overlay selection against current shell slots. */
export function resolveShellOverlayTab(tab: string, shellSlotIds: string[]): "agent" | `shell:${string}` {
  if (tab === "agent") return "agent";
  if (tab.startsWith("shell:")) {
    const slot = tab.slice("shell:".length);
    return shellSlotIds.includes(slot) ? `shell:${slot}` : "agent";
  }
  return "agent";
}
