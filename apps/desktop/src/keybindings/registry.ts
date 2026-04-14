/**
 * Default shortcuts (display + matching). "Mod" = ⌘ on macOS, Ctrl elsewhere.
 */

export type KeybindingCategory = "Navigation" | "Threads" | "Git diff" | "Files" | "General";

export type KeybindingId =
  | "prevThread"
  | "nextThread"
  | "toggleThreadSidebar"
  | "newThreadMenu"
  | "addTerminal"
  | "toggleTerminalPanel"
  | "focusFileSearch"
  | "focusAgentTab"
  | "focusGitPanel"
  | "focusFilesPanel"
  | "focusPreviewPanel"
  | "workspaceLauncher"
  | "stageAllDiff"
  | "openSettings"
  | "contextQueueSelectionQueue"
  | "contextQueueSelectionSendToAgent";

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
  /** Additional chords that trigger the same action (shown in Settings and tooltips). */
  aliases?: PhysicalShortcut[];
  /** Shown in Settings when shortcut is dynamic (e.g. terminal tab index) */
  notes?: string;
};

/** User override (primary chord only in v1; aliases fall back to defaults when omitted). */
export type KeybindingOverride = {
  shortcut: PhysicalShortcut;
  aliases?: PhysicalShortcut[];
};

export function mergeKeybindingOverrides(
  defaults: KeybindingDefinition[],
  overrides: Partial<Record<KeybindingId, KeybindingOverride>>
): KeybindingDefinition[] {
  return defaults.map((def) => {
    const o = overrides[def.id];
    if (!o) return def;
    return {
      ...def,
      shortcut: o.shortcut,
      aliases: o.aliases ?? def.aliases
    };
  });
}

export function findDefinitionIn(
  defs: KeybindingDefinition[],
  id: KeybindingId
): KeybindingDefinition | undefined {
  return defs.find((d) => d.id === id);
}

export function shortcutsEqual(a: PhysicalShortcut, b: PhysicalShortcut): boolean {
  return (
    a.code === b.code &&
    a.mod === b.mod &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || navigator.userAgent.includes("Mac");
}

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight"
]);

/**
 * Build a `PhysicalShortcut` from a keydown event for rebinding UI.
 * Returns null for modifier-only keys or combos the app does not treat as workspace shortcuts (e.g. Ctrl+key on macOS).
 */
export function physicalShortcutFromKeyboardEvent(ev: KeyboardEvent): PhysicalShortcut | null {
  if (ev.repeat) return null;
  const code = ev.code;
  if (!code || MODIFIER_CODES.has(code)) return null;
  const mac = isMacPlatform();
  if (mac && ev.ctrlKey) return null;
  if (!mac && ev.metaKey) return null;
  const mod = mac ? ev.metaKey : ev.ctrlKey;
  const shift = ev.shiftKey;
  const alt = ev.altKey;
  const s: PhysicalShortcut = { mod, code };
  if (shift) s.shift = true;
  if (alt) s.alt = true;
  return s;
}

/** True if `needle` equals this binding’s primary or any alias. */
export function bindingUsesShortcut(def: KeybindingDefinition, needle: PhysicalShortcut): boolean {
  if (shortcutsEqual(def.shortcut, needle)) return true;
  return Boolean(def.aliases?.some((a) => shortcutsEqual(a, needle)));
}

/** First other action that already uses this chord, or null. */
export function conflictingBindingId(
  defs: KeybindingDefinition[],
  forId: KeybindingId,
  needle: PhysicalShortcut
): KeybindingId | null {
  for (const d of defs) {
    if (d.id === forId) continue;
    if (bindingUsesShortcut(d, needle)) return d.id;
  }
  return null;
}

const mod = (code: string, opts?: { shift?: boolean; alt?: boolean }): PhysicalShortcut => ({
  mod: true,
  code,
  ...opts
});

/** ⌘1 … ⌘9 slot indices 0–8 (layout-stable `KeyboardEvent.code` values). */
export const MOD_DIGIT_SLOT_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9"
] as const;

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
    Backslash: "\\",
    Backquote: "`",
    KeyB: "B",
    KeyT: "T",
    KeyS: "S",
    KeyF: "F",
    KeyK: "K",
    KeyN: "N",
    KeyJ: "J",
    KeyG: "G",
    KeyE: "E",
    KeyA: "A",
    Enter: "↵"
  };
  return map[code] ?? code.replace(/^Key/, "");
}

export const KEYBINDING_DEFINITIONS: KeybindingDefinition[] = [
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
    shortcut: mod("KeyB"),
    aliases: [mod("Backslash")]
  },
  {
    id: "newThreadMenu",
    label: "New thread (open agent menu)",
    category: "Threads",
    shortcut: mod("KeyT", { shift: true }),
    aliases: [mod("KeyN")],
    notes: "⌘⇧T / Ctrl+Shift+T or ⌘N / Ctrl+N."
  },
  {
    id: "addTerminal",
    label: "Add terminal tab",
    category: "Navigation",
    shortcut: mod("Digit1", { shift: true })
  },
  {
    id: "toggleTerminalPanel",
    label: "Show or hide terminal bar",
    category: "Navigation",
    shortcut: mod("KeyJ")
  },
  {
    id: "focusFileSearch",
    label: "Focus file search",
    category: "Files",
    shortcut: mod("KeyF", { shift: true })
  },
  {
    id: "focusAgentTab",
    label: "Switch to Agent tab",
    category: "Navigation",
    shortcut: mod("KeyA", { shift: true }),
    notes: "Center panel; works while the integrated terminal is focused."
  },
  {
    id: "focusGitPanel",
    label: "Switch to Git tab",
    category: "Navigation",
    shortcut: mod("KeyG", { shift: true }),
    notes: "Only when the workspace has a Git repository."
  },
  {
    id: "focusFilesPanel",
    label: "Switch to Files tab",
    category: "Navigation",
    shortcut: mod("KeyE", { shift: true }),
    notes: "Center file explorer; works while the integrated terminal is focused."
  },
  {
    id: "focusPreviewPanel",
    label: "Switch to Preview tab",
    category: "Navigation",
    shortcut: mod("KeyB", { shift: true }),
    notes: "In-app browser preview; works while the integrated terminal is focused."
  },
  {
    id: "workspaceLauncher",
    label: "Workspace launcher (search threads and files)",
    category: "Navigation",
    shortcut: mod("KeyK")
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
  },
  {
    id: "contextQueueSelectionQueue",
    label: "Queue selection for agent context (when the bar is visible)",
    category: "General",
    shortcut: mod("Enter", { shift: true }),
    notes: "Runs when the Queue / Agent bar appears after you highlight text."
  },
  {
    id: "contextQueueSelectionSendToAgent",
    label: "Send selection to agent now (when the bar is visible)",
    category: "General",
    shortcut: mod("Enter"),
    notes: "Runs when the Queue / Agent bar is visible; sends straight to the agent terminal."
  }
];

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

/** Tooltip / tab hint for the n-th ⌘-digit slot (0 = ⌘1). Empty if out of range. */
export function shortcutForModDigitSlot(zeroBasedSlot: number): string {
  if (zeroBasedSlot < 0 || zeroBasedSlot >= MOD_DIGIT_SLOT_CODES.length) return "";
  return formatShortcut({ mod: true, code: MOD_DIGIT_SLOT_CODES[zeroBasedSlot] });
}

/** Primary shortcut plus any aliases, for tooltips and the keyboard settings table. */
export function formatBindingDisplay(def: KeybindingDefinition): string {
  const parts = [formatShortcut(def.shortcut), ...(def.aliases ?? []).map((a) => formatShortcut(a))];
  return parts.join(" · ");
}

export function shortcutForId(id: KeybindingId): string {
  const def = KEYBINDING_DEFINITIONS.find((d) => d.id === id);
  return def ? formatBindingDisplay(def) : "";
}

export function titleWithShortcut(label: string, id: KeybindingId): string {
  const s = shortcutForId(id);
  return s ? `${label} (${s})` : label;
}

export function findDefinition(id: KeybindingId): (typeof KEYBINDING_DEFINITIONS)[number] | undefined {
  return KEYBINDING_DEFINITIONS.find((d) => d.id === id);
}

/** True if the event matches the binding’s primary shortcut or any alias. */
export function eventMatchesBinding(ev: KeyboardEvent, def: KeybindingDefinition): boolean {
  if (eventMatchesShortcut(ev, def.shortcut)) return true;
  return Boolean(def.aliases?.some((a) => eventMatchesShortcut(ev, a)));
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
