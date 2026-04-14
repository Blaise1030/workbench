import { describe, expect, it } from "vitest";
import { buildCommitSuggestionPrompt } from "@/features/localLlm/commitPrompt";

describe("buildCommitSuggestionPrompt", () => {
  it("contains Staged diff section and ends with the passed diff text", () => {
    const diff = "diff --git a/foo b/foo\n+bar\n";
    const out = buildCommitSuggestionPrompt(diff, false);
    expect(out).toContain("Staged diff:");
    expect(out.endsWith(diff)).toBe(true);
  });

  it("when truncated is true, includes a warning that mentions truncation", () => {
    const out = buildCommitSuggestionPrompt("x", true);
    expect(out.toLowerCase()).toMatch(/truncated/);
  });
});
