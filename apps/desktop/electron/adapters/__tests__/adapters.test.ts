import { describe, expect, it } from "vitest";
import { ClaudeCodeCliAdapter } from "../claudeCodeCliAdapter";
import { CodexCliAdapter } from "../codexCliAdapter";
import { CursorCliAdapter } from "../cursorCliAdapter";
import { GeminiCliAdapter } from "../geminiCliAdapter";

describe("agent adapters", () => {
  it("detects codex review state", () => {
    const adapter = new CodexCliAdapter();
    expect(adapter.detectState("waiting for review")).toBe("needsReview");
  });

  it("detects claude completion state", () => {
    const adapter = new ClaudeCodeCliAdapter();
    expect(adapter.detectState("completed successfully")).toBe("done");
  });

  it("detects gemini approval state", () => {
    const adapter = new GeminiCliAdapter();
    expect(adapter.detectState("Waiting for approval")).toBe("needsReview");
  });

  it("detects cursor approval state", () => {
    const adapter = new CursorCliAdapter();
    expect(adapter.detectState("Waiting for approval...")).toBe("needsReview");
  });
});
