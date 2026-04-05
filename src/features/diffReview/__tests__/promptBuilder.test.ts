import { describe, expect, it } from "vitest";
import { buildAgentReviewPrompt } from "@/features/diffReview/promptBuilder";
import type { DiffReviewItem } from "@/features/diffReview/types";

const items: DiffReviewItem[] = [
  {
    id: "item-1",
    worktreeId: "wt-1",
    threadId: null,
    filePath: "src/alpha.ts",
    oldLineStart: null,
    oldLineEnd: null,
    newLineStart: 10,
    newLineEnd: 12,
    snippet: "@@ -0,0 +10,3 @@\n+alpha()",
    note: "",
    intent: "fix",
    createdAt: "2026-04-06T00:00:00.000Z"
  },
  {
    id: "item-2",
    worktreeId: "wt-1",
    threadId: "thread-2",
    filePath: "src/beta.ts",
    oldLineStart: 3,
    oldLineEnd: 6,
    newLineStart: 4,
    newLineEnd: 7,
    snippet: "@@ -3,4 +4,4 @@\n-beta()\n+beta()",
    note: "Please simplify this branch.",
    intent: "rework",
    createdAt: "2026-04-06T00:01:00.000Z"
  }
];

const multilineNoteItem: DiffReviewItem = {
  id: "item-3",
  worktreeId: "wt-2",
  threadId: null,
  filePath: "src/gamma.ts",
  oldLineStart: null,
  oldLineEnd: null,
  newLineStart: 1,
  newLineEnd: 1,
  snippet: "@@ -0,0 +1,1 @@\n+gamma()",
  note: "First line.\nSecond line.\nThird line.",
  intent: null,
  createdAt: "2026-04-06T00:02:00.000Z"
};

describe("buildAgentReviewPrompt", () => {
  it("renders review items in stable input order with the expected fields", () => {
    const prompt = buildAgentReviewPrompt(items);

    const firstItemIndex = prompt.indexOf("1. file: src/alpha.ts");
    const secondItemIndex = prompt.indexOf("2. file: src/beta.ts");

    expect(firstItemIndex).toBeGreaterThan(-1);
    expect(secondItemIndex).toBeGreaterThan(firstItemIndex);
    expect(prompt).toContain("lines: new 10-12");
    expect(prompt).toContain("lines: old 3-6, new 4-7");
    expect(prompt).toContain("intent: fix");
    expect(prompt).toContain("intent: rework");
    expect(prompt).toContain("note: |\n  Please review this selected change");
    expect(prompt).toContain("note: |\n  Please simplify this branch.");
    expect(prompt).toContain("snippet:\n@@ -0,0 +10,3 @@\n+alpha()");
    expect(prompt).toContain("snippet:\n@@ -3,4 +4,4 @@\n-beta()\n+beta()");
  });

  it("keeps multiline notes scoped within the note block and omits null intent", () => {
    const prompt = buildAgentReviewPrompt([multilineNoteItem]);

    expect(prompt).toContain("note: |\n  First line.\n  Second line.\n  Third line.");
    expect(prompt).not.toContain("intent:");
    expect(prompt).toContain("snippet:\n@@ -0,0 +1,1 @@\n+gamma()");
  });

  it("renders unavailable line metadata when no line numbers are present", () => {
    const prompt = buildAgentReviewPrompt([
      {
        ...multilineNoteItem,
        oldLineStart: null,
        oldLineEnd: null,
        newLineStart: null,
        newLineEnd: null
      }
    ]);

    expect(prompt).toContain("lines: unavailable");
  });

  it("handles an empty items array", () => {
    const prompt = buildAgentReviewPrompt([]);

    expect(prompt).toBe(
      [
        "Please address the following review findings from the current git diff.",
        "",
        "Please make the required code changes and explain what you changed."
      ].join("\n")
    );
  });

  it("ends with the required action request", () => {
    const prompt = buildAgentReviewPrompt(items);

    expect(prompt.trimEnd().endsWith("Please make the required code changes and explain what you changed.")).toBe(
      true
    );
  });
});
