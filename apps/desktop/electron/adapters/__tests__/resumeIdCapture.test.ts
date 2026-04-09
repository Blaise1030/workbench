import { describe, expect, it } from "vitest";
import { extractResumeIdFromStdout } from "../resumeIdCapture.js";

describe("extractResumeIdFromStdout (agent --resume=)", () => {
  it("extracts unquoted id after agent --resume=", () => {
    expect(extractResumeIdFromStdout("Run: cursor agent --resume=abc-def-12345678 to continue")).toBe(
      "abc-def-12345678"
    );
  });

  it("extracts double-quoted id", () => {
    expect(extractResumeIdFromStdout('agent --resume="my-session-id-99"')).toBe("my-session-id-99");
  });

  it("extracts single-quoted id", () => {
    expect(extractResumeIdFromStdout("agent --resume='uuid-here-12'")).toBe("uuid-here-12");
  });

  it("strips ANSI before matching", () => {
    expect(extractResumeIdFromStdout("\x1b[32mcursor agent --resume=\x1b[0msess-abc\x1b[m")).toBe("sess-abc");
  });

  it("returns null when no agent --resume= line", () => {
    expect(extractResumeIdFromStdout("Welcome to Cursor. Type your query.")).toBeNull();
  });

  it("returns null for bare UUID without agent --resume=", () => {
    expect(extractResumeIdFromStdout("Session 550e8400-e29b-41d4-a716-446655440000 ended.")).toBeNull();
  });

  it("uses the last match when several appear", () => {
    expect(
      extractResumeIdFromStdout("agent --resume=first-id\nlater: cursor agent --resume=second-id")
    ).toBe("second-id");
  });
});
