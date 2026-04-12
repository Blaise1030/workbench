import { describe, expect, it } from "vitest";
import { buildPasteText } from "@/contextQueue/formatters";
import { queueContextBadgeLabel, queueSnippetPreview } from "@/contextQueue/reviewPasteLabels";
import type { QueueItem } from "@/contextQueue/types";

function item(source: QueueItem["source"], pasteText: string): QueueItem {
  return { id: "x", source, pasteText, meta: {} };
}

describe("reviewPasteLabels", () => {
  it("labels diff with explicit lines", () => {
    const paste = buildPasteText({
      source: "diff",
      filePath: "a/b.ts",
      selectedText: "x",
      lineStart: 7,
      lineEnd: 11
    });
    expect(queueContextBadgeLabel(item("diff", paste))).toBe("[File, 7:11]");
  });

  it("labels file capture with line span from body", () => {
    const paste = buildPasteText({
      source: "file",
      filePath: "README.md",
      selectedText: "one\ntwo\nthree"
    });
    expect(queueContextBadgeLabel(item("file", paste))).toBe("[File, 1:3]");
  });

  it("labels agent tab terminal selection", () => {
    const paste = buildPasteText({
      source: "terminal",
      agentTab: true,
      selectedText: "a\nb"
    });
    expect(queueContextBadgeLabel(item("terminal", paste))).toBe("[Agent 1:2]");
  });

  it("labels plain terminal selection", () => {
    const paste = buildPasteText({
      source: "terminal",
      agentTab: false,
      selectedText: "only"
    });
    expect(queueContextBadgeLabel(item("terminal", paste))).toBe("[Terminal, 1:1]");
  });

  it("snippet preview returns fenced body for file", () => {
    const paste = buildPasteText({
      source: "file",
      filePath: "x.ts",
      selectedText: "hello"
    });
    expect(queueSnippetPreview(item("file", paste))).toContain("hello");
  });
});
