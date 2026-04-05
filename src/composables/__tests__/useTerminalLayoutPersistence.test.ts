import { afterEach, describe, expect, it } from "vitest";
import {
  loadTerminalLayout,
  resolveCenterTab,
  saveTerminalLayout
} from "../useTerminalLayoutPersistence";

describe("useTerminalLayoutPersistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips layout", () => {
    saveTerminalLayout("wt-1", { centerTab: "diff", shellSlotIds: ["a", "b"] });
    expect(loadTerminalLayout("wt-1")).toEqual({
      centerTab: "diff",
      shellSlotIds: ["a", "b"]
    });
  });

  it("resolveCenterTab falls back when shell slot missing", () => {
    expect(resolveCenterTab("shell:gone", ["a"])).toBe("agent");
    expect(resolveCenterTab("shell:a", ["a"])).toBe("shell:a");
  });
});
