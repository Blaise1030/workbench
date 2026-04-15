import { describe, expect, it } from "vitest";
import { buildCommitSuggestionPrompt, buildCommitSystemPrompt } from "@/features/localLlm/commitPrompt";

describe("buildCommitSystemPrompt", () => {
  it("contains output rules and an example", () => {
    const out = buildCommitSystemPrompt();
    expect(out.toLowerCase()).toContain("imperative");
    expect(out).toContain("72");
    expect(out).toContain("Example output:");
  });

  it("does not contain the label 'Staged diff' that small models echo", () => {
    expect(buildCommitSystemPrompt().toLowerCase()).not.toContain("staged diff");
  });
});

describe("buildCommitSuggestionPrompt", () => {
  it("starts with the diff text so the model sees data before the instruction", () => {
    const diff = "diff --git a/foo b/foo\n+bar\n";
    const out = buildCommitSuggestionPrompt(diff, false);
    expect(out.startsWith(diff)).toBe(true);
  });

  it("does not include the label 'Staged diff:' that small models echo verbatim", () => {
    const out = buildCommitSuggestionPrompt("x", false);
    expect(out.toLowerCase()).not.toContain("staged diff:");
  });

  it("when truncated is true, includes a note mentioning truncation", () => {
    const out = buildCommitSuggestionPrompt("x", true);
    expect(out.toLowerCase()).toMatch(/truncated/);
  });
});
