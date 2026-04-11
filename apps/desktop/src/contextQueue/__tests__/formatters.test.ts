import { describe, expect, it } from "vitest";
import { buildPasteText } from "../formatters";
import type { QueueCapture } from "../types";

describe("buildPasteText", () => {
  it("formats diff capture", () => {
    const c: QueueCapture = {
      source: "diff",
      filePath: "src/a.ts",
      selectedText: "foo",
      lineStart: 2,
      lineEnd: 3,
    };
    expect(buildPasteText(c)).toContain("src/a.ts");
    expect(buildPasteText(c)).toContain("foo");
  });

  it("formats folder with listing", () => {
    const c: QueueCapture = {
      source: "folder",
      folderPath: "/p/x",
      listingText: "a\nb",
    };
    const t = buildPasteText(c);
    expect(t).toContain("/p/x");
    expect(t).toContain("a");
  });

  it("formats file capture with path and selection", () => {
    const c: QueueCapture = {
      source: "file",
      filePath: "lib/b.ts",
      selectedText: "export const x = 1;",
      lineStart: 10,
      lineEnd: 12,
    };
    const t = buildPasteText(c);
    expect(t).toContain("[file]");
    expect(t).toContain("lib/b.ts");
    expect(t).toContain("Lines: 10-12");
    expect(t).toContain("export const x = 1;");
  });

  it("formats terminal capture with session label", () => {
    const c: QueueCapture = {
      source: "terminal",
      selectedText: "npm test\nPASS",
      sessionLabel: "zsh-1",
    };
    const t = buildPasteText(c);
    expect(t).toContain("[terminal]");
    expect(t).toContain("Session: zsh-1");
    expect(t).toContain("npm test");
    expect(t).not.toMatch(/\n\n\n/);
  });

  it("formats terminal capture without session label without extra blank lines", () => {
    const c: QueueCapture = {
      source: "terminal",
      selectedText: "echo hi",
    };
    const t = buildPasteText(c);
    expect(t).toContain("[terminal]");
    expect(t).toContain("echo hi");
    expect(t).not.toContain("Session:");
    expect(t.split("\n").filter((line) => line === "").length).toBe(0);
  });
});
