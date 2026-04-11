import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { KEYBINDING_DEFINITIONS, mergeKeybindingOverrides } from "@/keybindings/registry";
import {
  parseKeybindingOverridesFromStorage,
  resetKeybindingsStoreForTests,
  STORAGE_KEY_KEYBINDING_OVERRIDES,
  useKeybindingsStore
} from "../keybindingsStore";

describe("parseKeybindingOverridesFromStorage", () => {
  it("returns empty for null or invalid JSON", () => {
    expect(parseKeybindingOverridesFromStorage(null)).toEqual({});
    expect(parseKeybindingOverridesFromStorage("")).toEqual({});
    expect(parseKeybindingOverridesFromStorage("not json")).toEqual({});
    expect(parseKeybindingOverridesFromStorage("[]")).toEqual({});
  });

  it("filters unknown ids and invalid shapes", () => {
    const raw = JSON.stringify({
      openSettings: { shortcut: { mod: true, code: "KeyX" } },
      bogus: { shortcut: { mod: true, code: "KeyY" } },
      prevThread: { shortcut: { code: "KeyZ" } },
      nextThread: { shortcut: { mod: "yes", code: "KeyA" } }
    });
    expect(parseKeybindingOverridesFromStorage(raw)).toEqual({
      openSettings: { shortcut: { mod: true, code: "KeyX" } }
    });
  });
});

describe("useKeybindingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem(STORAGE_KEY_KEYBINDING_OVERRIDES);
  });

  it("effectiveDefinitions matches defaults when empty", () => {
    const store = useKeybindingsStore();
    expect(store.effectiveDefinitions).toEqual(KEYBINDING_DEFINITIONS);
  });

  it("setOverride merges and persists", () => {
    const store = useKeybindingsStore();
    store.setOverride("openSettings", { mod: true, code: "KeyX" });
    expect(store.effectiveDefinitions).toEqual(
      mergeKeybindingOverrides(KEYBINDING_DEFINITIONS, {
        openSettings: { shortcut: { mod: true, code: "KeyX" } }
      })
    );
    const raw = localStorage.getItem(STORAGE_KEY_KEYBINDING_OVERRIDES);
    expect(raw).toBeTruthy();
    expect(parseKeybindingOverridesFromStorage(raw)).toEqual({
      openSettings: { shortcut: { mod: true, code: "KeyX" } }
    });
  });

  it("resetKeybindingsStoreForTests clears storage and store", () => {
    const store = useKeybindingsStore();
    store.setOverride("toggleTerminalPanel", { mod: true, code: "KeyX" });
    resetKeybindingsStoreForTests();
    expect(localStorage.getItem(STORAGE_KEY_KEYBINDING_OVERRIDES)).toBeNull();
    expect(store.effectiveDefinitions).toEqual(KEYBINDING_DEFINITIONS);
  });

  it("shortcutLabelForId reflects overrides", () => {
    const store = useKeybindingsStore();
    store.setOverride("workspaceLauncher", { mod: true, code: "KeyX", shift: true });
    const label = store.shortcutLabelForId("workspaceLauncher");
    expect(label).toContain("X");
  });
});
