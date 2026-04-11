import { defineStore } from "pinia";
import {
  formatBindingDisplay,
  KEYBINDING_DEFINITIONS,
  mergeKeybindingOverrides,
  type KeybindingDefinition,
  type KeybindingId,
  type KeybindingOverride,
  type PhysicalShortcut
} from "@/keybindings/registry";

export const STORAGE_KEY_KEYBINDING_OVERRIDES = "instrument.keybindingOverrides";

const KNOWN_IDS = new Set<KeybindingId>(KEYBINDING_DEFINITIONS.map((d) => d.id));

function isPhysicalShortcut(x: unknown): x is PhysicalShortcut {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.code !== "string" || typeof o.mod !== "boolean") return false;
  if (o.shift !== undefined && typeof o.shift !== "boolean") return false;
  if (o.alt !== undefined && typeof o.alt !== "boolean") return false;
  return true;
}

function isKeybindingOverride(x: unknown): x is KeybindingOverride {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!isPhysicalShortcut(o.shortcut)) return false;
  if (o.aliases !== undefined) {
    if (!Array.isArray(o.aliases) || !o.aliases.every(isPhysicalShortcut)) return false;
  }
  return true;
}

export function parseKeybindingOverridesFromStorage(raw: string | null): Partial<
  Record<KeybindingId, KeybindingOverride>
> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Partial<Record<KeybindingId, KeybindingOverride>> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!KNOWN_IDS.has(k as KeybindingId)) continue;
      if (!isKeybindingOverride(v)) continue;
      out[k as KeybindingId] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function loadOverridesFromStorage(): Partial<Record<KeybindingId, KeybindingOverride>> {
  try {
    return parseKeybindingOverridesFromStorage(localStorage.getItem(STORAGE_KEY_KEYBINDING_OVERRIDES));
  } catch {
    return {};
  }
}

function persistOverrides(overrides: Partial<Record<KeybindingId, KeybindingOverride>>): void {
  try {
    localStorage.setItem(STORAGE_KEY_KEYBINDING_OVERRIDES, JSON.stringify(overrides));
  } catch {
    /* private mode / quota */
  }
}

export const useKeybindingsStore = defineStore("keybindings", {
  state: () => ({
    overrides: loadOverridesFromStorage() as Partial<Record<KeybindingId, KeybindingOverride>>
  }),

  getters: {
    effectiveDefinitions(): KeybindingDefinition[] {
      return mergeKeybindingOverrides(KEYBINDING_DEFINITIONS, this.overrides);
    },

    shortcutLabelForId(): (id: KeybindingId) => string {
      return (id: KeybindingId) => {
        const def = this.effectiveDefinitions.find((d) => d.id === id);
        return def ? formatBindingDisplay(def) : "";
      };
    },

    titleWithShortcut(): (label: string, id: KeybindingId) => string {
      return (label: string, id: KeybindingId) => {
        const s = this.shortcutLabelForId(id);
        return s ? `${label} (${s})` : label;
      };
    }
  },

  actions: {
    setOverride(id: KeybindingId, shortcut: PhysicalShortcut): void {
      this.overrides = { ...this.overrides, [id]: { shortcut } };
      persistOverrides(this.overrides);
    },

    clearOverride(id: KeybindingId): void {
      const next = { ...this.overrides };
      delete next[id];
      this.overrides = next;
      persistOverrides(this.overrides);
    },

    resetAll(): void {
      this.overrides = {};
      persistOverrides({});
    }
  }
});

/** Test helper: clear persisted overrides and reset store to initial state. */
export function resetKeybindingsStoreForTests(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_KEYBINDING_OVERRIDES);
  } catch {
    /* ignore */
  }
  useKeybindingsStore().$reset();
}
