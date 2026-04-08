import { describe, expect, it } from "vitest";
import { extractResumeIdFromStdout } from "../resumeIdCapture";
import { CursorCliAdapter } from "../cursorCliAdapter";

describe("extractResumeIdFromStdout", () => {
  it("extracts session_id from JSON fragment", () => {
    expect(extractResumeIdFromStdout('"session_id":"abc-def-12345678"')).toBe("abc-def-12345678");
  });

  it("extracts chat_id label", () => {
    expect(extractResumeIdFromStdout("chat_id: chatABC123")).toBe("chatABC123");
  });

  it("extracts a bare UUID", () => {
    expect(extractResumeIdFromStdout("Connected. Session 550e8400-e29b-41d4-a716-446655440000 ready.")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
  });

  it("strips ANSI escape sequences before matching", () => {
    expect(extractResumeIdFromStdout("\x1b[32msession_id: abcdef99\x1b[0m")).toBe("abcdef99");
  });

  it("returns null for unrelated output", () => {
    expect(extractResumeIdFromStdout("Welcome to Cursor. Type your query.")).toBeNull();
  });

  it("returns null when session_id value is too short", () => {
    expect(extractResumeIdFromStdout('"session_id":"short"')).toBeNull();
  });
});

describe("CursorCliAdapter", () => {
  it("has provider set to cursor", () => {
    const adapter = new CursorCliAdapter();
    expect(adapter.provider).toBe("cursor");
  });

  it("detects resume ID from output", () => {
    const adapter = new CursorCliAdapter();
    expect(adapter.detectResumeId("session_id: resumable-session-99")).toBe("resumable-session-99");
  });

  it("returns null for non-session output", () => {
    const adapter = new CursorCliAdapter();
    expect(adapter.detectResumeId("Running test suite...")).toBeNull();
  });
});
