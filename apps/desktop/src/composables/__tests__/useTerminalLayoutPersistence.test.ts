import { afterEach, describe, expect, it } from "vitest";
import {
  loadTerminalLayout,
  resolveCenterTab,
  resolveShellOverlayTab,
  saveTerminalLayout
} from "../useTerminalLayoutPersistence";

describe("useTerminalLayoutPersistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips layout", () => {
    saveTerminalLayout("wt-1", {
      centerTab: "diff",
      shellSlotIds: ["a", "b"],
      terminalPanelOpen: false
    });
    expect(loadTerminalLayout("wt-1")).toEqual({
      centerTab: "diff",
      shellSlotIds: ["a", "b"],
      terminalPanelOpen: false,
      shellOverlayTab: undefined,
      terminalPanelHeightPx: undefined
    });
  });

  it("resolveCenterTab falls back when shell slot missing", () => {
    expect(resolveCenterTab("shell:gone", ["a"])).toBe("agent");
    expect(resolveCenterTab("shell:a", ["a"])).toBe("shell:a");
  });

  it("resolveCenterTab preserves preview tab", () => {
    expect(resolveCenterTab("preview", [])).toBe("preview");
  });

  it("resolveShellOverlayTab falls back when shell slot missing", () => {
    expect(resolveShellOverlayTab("shell:gone", ["a"])).toBe("agent");
    expect(resolveShellOverlayTab("shell:a", ["a"])).toBe("shell:a");
    expect(resolveShellOverlayTab("agent", ["a"])).toBe("agent");
  });
});
