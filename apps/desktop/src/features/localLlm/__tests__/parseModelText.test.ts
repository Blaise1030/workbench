import { describe, expect, it } from "vitest";
import { parseCommitCandidates, parseThreadTitle } from "@/features/localLlm/parseModelText";

describe("parseCommitCandidates", () => {
  it("strips ``` fences and returns up to 3 non-empty lines", () => {
    const raw = "```\nfix: handle null\nfeat: add tests\nchore: bump deps\nextra line\n```";
    expect(parseCommitCandidates(raw)).toEqual([
      "fix: handle null",
      "feat: add tests",
      "chore: bump deps"
    ]);
  });

  it("returns fewer than 3 when fewer non-empty lines exist", () => {
    expect(parseCommitCandidates("only one line")).toEqual(["only one line"]);
  });
});

describe("parseThreadTitle", () => {
  it("returns first non-empty line, max 60 chars, no newlines in result", () => {
    const longFirst =
      "This is a very long first line that exceeds sixty characters and should be sliced";
    const raw = `\n\n  ${longFirst}\nsecond ignored\n`;
    const title = parseThreadTitle(raw);
    expect(title).toBe(longFirst.slice(0, 60));
    expect(title).not.toContain("\n");
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("strips optional outer quotes on the chosen line", () => {
    expect(parseThreadTitle(`"Refactor auth flow"`)).toBe("Refactor auth flow");
  });
});
