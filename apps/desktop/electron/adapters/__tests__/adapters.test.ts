import { describe, expect, it } from "vitest";
import { ClaudeCodeCliAdapter } from "../claudeCodeCliAdapter";
import { CodexCliAdapter } from "../codexCliAdapter";

describe("agent adapters", () => {
  it("detects codex review state", () => {
    const adapter = new CodexCliAdapter();
    expect(adapter.detectState("waiting for review")).toBe("needsReview");
  });

  it("detects claude completion state", () => {
    const adapter = new ClaudeCodeCliAdapter();
    expect(adapter.detectState("completed successfully")).toBe("done");
  });
});
