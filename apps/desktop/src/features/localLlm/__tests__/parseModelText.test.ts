import { describe, expect, it } from "vitest";
import { parseCommitCandidates, parseThreadTitle } from "@/features/localLlm/parseModelText";

describe("parseCommitCandidates", () => {
  it("strips ``` fences and returns up to COMMIT_CANDIDATE_COUNT non-empty lines", () => {
    const raw = "```\nfix: handle null\nfeat: add tests\nchore: bump deps\nextra line\n```";
    expect(parseCommitCandidates(raw)).toEqual(["fix: handle null"]);
  });

  it("returns fewer than 3 when fewer non-empty lines exist", () => {
    expect(parseCommitCandidates("only one line")).toEqual(["only one line"]);
  });

  it("strips leading bullet characters", () => {
    const raw = "* feat: add login\n- fix: null check\n* chore: lint";
    expect(parseCommitCandidates(raw)).toEqual(["feat: add login"]);
  });

  it("filters out lines that look like echoed diff content", () => {
    const raw = [
      "diff --git a/foo b/foo",
      "feat: add staging support",
      "--- a/bar",
      "+++ b/bar",
      "fix: handle edge case"
    ].join("\n");
    const result = parseCommitCandidates(raw);
    expect(result).toEqual(["feat: add staging support"]);
    expect(result.some((l) => l.includes("diff --git"))).toBe(false);
  });

  it("filters out lines that echo 'staged diff' prompt labels", () => {
    const raw = "* Staged diff: 'Staged diff: staged diff'\nfeat: real commit message";
    const result = parseCommitCandidates(raw);
    expect(result).toEqual(["feat: real commit message"]);
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

  it("strips model/provider inquiry prefix from generated titles", () => {
    expect(parseThreadTitle("Claude Inquiry: Non-standard UI Design Rationale")).toBe(
      "Non-standard UI Design Rationale"
    );
  });
});
