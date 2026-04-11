import { describe, expect, it } from "vitest";
import { buildPasteText } from "../formatters";
import type { QueueCapture } from "../types";
import { joinDiffQueuePaste, parseDiffQueuePaste } from "../diffPasteParse";

describe("parseDiffQueuePaste / joinDiffQueuePaste", () => {
  it("round-trips a canonical diff paste with no user prefix or suffix", () => {
    const c: QueueCapture = {
      source: "diff",
      filePath: "ci/deploy-landing-page.yml",
      selectedText: "x\ny",
      lineStart: 6,
      lineEnd: 18
    };
    const raw = buildPasteText(c);
    const p = parseDiffQueuePaste(raw);
    expect(p).not.toBeNull();
    expect(p!.prefix).toBe("");
    expect(p!.suffix).toBe("");
    expect(p!.capture).toEqual({
      source: "diff",
      filePath: "ci/deploy-landing-page.yml",
      selectedText: "x\ny",
      lineStart: 6,
      lineEnd: 18
    });
    expect(joinDiffQueuePaste("", p!.capture, "")).toBe(raw);
  });

  it("preserves prefix and suffix around the diff block", () => {
    const c: QueueCapture = {
      source: "diff",
      filePath: "a/b.ts",
      selectedText: "body",
      lineStart: 1,
      lineEnd: 2
    };
    const core = buildPasteText(c);
    const combined = joinDiffQueuePaste("note before", c, "note after");
    const p = parseDiffQueuePaste(combined);
    expect(p?.prefix).toBe("note before");
    expect(p?.suffix).toBe("note after");
    expect(joinDiffQueuePaste(p!.prefix, p!.capture, p!.suffix)).toBe(combined);
  });

  it("parses diff paste without line numbers", () => {
    const c: QueueCapture = {
      source: "diff",
      filePath: "README.md",
      selectedText: "x"
    };
    const raw = buildPasteText(c);
    const p = parseDiffQueuePaste(raw);
    expect(p).not.toBeNull();
    expect(p!.capture.lineStart).toBeUndefined();
    expect(joinDiffQueuePaste("", p!.capture, "")).toBe(raw);
  });

  it("returns null for non-diff paste", () => {
    expect(parseDiffQueuePaste("[file]\nPath: x")).toBeNull();
    expect(parseDiffQueuePaste("plain")).toBeNull();
  });
});
