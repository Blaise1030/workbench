/**
 * Default shortcuts (display + matching). "Mod" = ⌘ on macOS, Ctrl elsewhere.
 */

export type KeybindingCategory = "Navigation" | "Threads" | "Git diff" | "Files" | "General";

export type KeybindingId =
  | "centerTabAgent"
  | "centerTabDiff"
  | "centerTabFiles"
  | "centerTabShellSlot"
  | "prevThread"
  | "nextThread"
  | "toggleThreadSidebar"
  | "newThreadMenu"
  | "addTerminal"
  | "focusFileSearch"
  | "stageAllDiff"
  | "openSettings";

export type PhysicalShortcut = {
  /** Command on macOS, Control elsewhere */
  mod: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Prefer matching on `code` (layout-stable) */
  code: string;
};

export type KeybindingDefinition = {
  id: KeybindingId;
  label: string;
  category: KeybindingCategory;
  /** Static shortcut; shell slots use suffix in UI only */
  shortcut: PhysicalShortcut;
  /** Shown in Settings when shortcut is dynamic (e.g. terminal tab index) */
  notes?: string;
};

const mod = (code: string, opts?: { shift?: boolean; alt?: boolean }): PhysicalShortcut => ({
  mod: true,
  code,
  ...opts
});

/** Label fragment for one key (for tooltips / settings) */
function codeToDisplayLabel(code: string): string {
  const map: Record<string, string> = {
    Digit1: "1",
    Digit2: "2",
    Digit3: "3",
    Digit4: "4",
    Digit5: "5",
    Digit6: "6",
    Digit7: "7",
    Digit8: "8",
    Digit9: "9",
    Digit0: "0",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Backquote: "`",
    KeyB: "B",
    KeyT: "T",
    KeyS: "S",
    KeyF: "F"
  };
  return map[code] ?? code.replace(/^Key/, "");
}

/** Fixed shortcuts only; center-tab digits 4+ documented separately */
export const KEYBINDING_DEFINITIONS: KeybindingDefinition[] = [
  {
    id: "centerTabAgent",
    label: "Open Agent tab",
    category: "Navigation",
    shortcut: mod("Digit1")
  },
  {
    id: "centerTabDiff",
    label: "Open Git Diff tab",
    category: "Navigation",
    shortcut: mod("Digit2")
  },
  {
    id: "centerTabFiles",
    label: "Open Files tab",
    category: "Navigation",
    shortcut: mod("Digit3")
  },
  {
    id: "centerTabShellSlot",
    label: "Open terminal tab",
    category: "Navigation",
    shortcut: mod("Digit4"),
    notes: "⌘4 / Ctrl+4 first extra terminal; ⌘5, ⌘6, … for additional terminals when present."
  },
  {
    id: "prevThread",
    label: "Previous thread",
    category: "Threads",
    shortcut: mod("BracketLeft")
  },
  {
    id: "nextThread",
    label: "Next thread",
    category: "Threads",
    shortcut: mod("BracketRight")
  },
  {
    id: "toggleThreadSidebar",
    label: "Collapse or expand threads sidebar",
    category: "Threads",
    shortcut: mod("KeyB")
  },
  {
    id: "newThreadMenu",
    label: "New thread (open agent menu)",
    category: "Threads",
    shortcut: mod("KeyT", { shift: true })
  },
  {
    id: "addTerminal",
    label: "Add terminal tab",
    category: "Navigation",
    shortcut: mod("Backquote", { shift: true })
  },
  {
    id: "focusFileSearch",
    label: "Focus file search",
    category: "Files",
    shortcut: mod("KeyF", { shift: true })
  },
  {
    id: "stageAllDiff",
    label: "Stage all (Git Diff tab)",
    category: "Git diff",
    shortcut: mod("KeyS", { shift: true }),
    notes: "Only when Git Diff is open and focus is not in the integrated terminal."
  },
  {
    id: "openSettings",
    label: "Open settings",
    category: "General",
    shortcut: mod("Comma")
  }
];

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || navigator.userAgent.includes("Mac");
}

/** Human-readable shortcut for tooltips and Settings */
export function formatShortcut(s: PhysicalShortcut): string {
  const mac = isMacPlatform();
  const sym = codeToDisplayLabel(s.code);
  if (mac) {
    let out = "";
    if (s.mod) out += "⌘";
    if (s.shift) out += "⇧";
    if (s.alt) out += "⌥";
    out += sym;
    return out;
  }
  const parts: string[] = [];
  if (s.mod) parts.push("Ctrl");
  if (s.shift) parts.push("Shift");
  if (s.alt) parts.push("Alt");
  parts.push(sym);
  return parts.join("+");
}

export function shortcutForId(id: KeybindingId): string {
  const def = KEYBINDING_DEFINITIONS.find((d) => d.id === id);
  return def ? formatShortcut(def.shortcut) : "";
}

export function titleWithShortcut(label: string, id: KeybindingId): string {
  const s = shortcutForId(id);
  return s ? `${label} (${s})` : label;
}

export function findDefinition(id: KeybindingId): (typeof KEYBINDING_DEFINITIONS)[number] | undefined {
  return KEYBINDING_DEFINITIONS.find((d) => d.id === id);
}

/** Match event against a physical shortcut (Mod = meta on Mac else ctrl) */
export function eventMatchesShortcut(ev: KeyboardEvent, s: PhysicalShortcut): boolean {
  if (ev.repeat) return false;
  if (ev.code !== s.code) return false;
  const mac = isMacPlatform();
  const modDown = mac ? ev.metaKey : ev.ctrlKey;
  if (s.mod !== modDown) return false;
  if (Boolean(s.shift) !== ev.shiftKey) return false;
  if (Boolean(s.alt) !== ev.altKey) return false;
  if (mac && ev.ctrlKey) return false;
  if (!mac && ev.metaKey) return false;
  return true;
}

export function isFocusInsideInstrumentTerminal(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest("[data-instrument-terminal]"));
}

/** Inputs, textareas, selects, CodeMirror — avoid stealing tab/thread shortcuts */
export function isTypingSurface(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest("[data-instrument-terminal]")) return true;
  if (target.closest(".cm-editor")) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return false;
}
