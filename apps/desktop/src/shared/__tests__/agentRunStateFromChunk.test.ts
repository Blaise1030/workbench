import { describe, expect, it } from "vitest";
import { detectRunStateFromChunk } from "../agentRunStateFromChunk";

describe("detectRunStateFromChunk", () => {
  it("claude: needs review", () => {
    expect(detectRunStateFromChunk("claude", "awaiting feedback")).toBe("needsReview");
  });

  it("codex: needs review", () => {
    expect(detectRunStateFromChunk("codex", "waiting for review")).toBe("needsReview");
  });

  it("gemini: done", () => {
    expect(detectRunStateFromChunk("gemini", "task completed")).toBe("done");
  });

  it("cursor: running output has no match", () => {
    expect(detectRunStateFromChunk("cursor", "thinking…")).toBe(null);
  });
});
