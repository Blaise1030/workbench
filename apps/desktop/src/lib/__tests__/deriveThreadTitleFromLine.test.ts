import { describe, expect, it } from "vitest";
import { deriveThreadTitleFromLine } from "../deriveThreadTitleFromLine";

describe("deriveThreadTitleFromLine", () => {
  it("uses first line and normalizes whitespace", () => {
    expect(deriveThreadTitleFromLine("\n  Fix tests  \nmore")).toBe("Fix tests");
  });

  it("returns null for empty input", () => {
    expect(deriveThreadTitleFromLine("  \n\t  ")).toBeNull();
  });
});
