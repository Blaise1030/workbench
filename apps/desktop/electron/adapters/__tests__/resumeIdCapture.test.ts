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

  it("extracts id after cursor --resume= without agent subcommand", () => {
    expect(
      extractResumeIdFromStdout("Run: cursor --resume=cb1438da-39bb-4f7f-8108-510fe91963e1 to continue")
    ).toBe("cb1438da-39bb-4f7f-8108-510fe91963e1");
  });

  it("returns null when a chunk ends right after --resume= and id is in the next chunk (caller must concatenate buffer)", () => {
    expect(extractResumeIdFromStdout("cursor agent --resume=")).toBeNull();
    expect(
      extractResumeIdFromStdout("cursor agent --resume=cb1438da-39bb-4f7f-8108-510fe91963e1")
    ).toBe("cb1438da-39bb-4f7f-8108-510fe91963e1");
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

describe("extractResumeIdFromStdout (claude --resume <id>)", () => {
  it("extracts id after claude --resume with space separator", () => {
    expect(extractResumeIdFromStdout("To resume this conversation, run: claude --resume abc-uuid-123")).toBe(
      "abc-uuid-123"
    );
  });

  it("extracts id after claude -r (short flag)", () => {
    expect(
      extractResumeIdFromStdout(
        "Resume with: claude -r cb1438da-39bb-4f7f-8108-510fe91963e1"
      )
    ).toBe("cb1438da-39bb-4f7f-8108-510fe91963e1");
  });

  it("extracts id after claude --resume= with equals separator", () => {
    expect(extractResumeIdFromStdout("claude --resume=my-session-456")).toBe("my-session-456");
  });

  it("strips ANSI before matching claude format", () => {
    expect(extractResumeIdFromStdout("\x1b[32mclaude --resume \x1b[0msess-xyz\x1b[m")).toBe("sess-xyz");
  });

  it("uses last match across both claude and agent formats", () => {
    expect(
      extractResumeIdFromStdout("agent --resume=old-id\nclaude --resume new-id")
    ).toBe("new-id");
  });

  it("extracts UUID from /status-style Session ID line", () => {
    expect(
      extractResumeIdFromStdout(
        "Session Status\nSession ID: cb1438da-39bb-4f7f-8108-510fe91963e1\nModel: Sonnet"
      )
    ).toBe("cb1438da-39bb-4f7f-8108-510fe91963e1");
  });

  it("extracts UUID from JSON sessionId field (Claude Code jsonl-style)", () => {
    expect(
      extractResumeIdFromStdout(
        '{"type":"user","sessionId":"cb1438da-39bb-4f7f-8108-510fe91963e1","text":"hi"}'
      )
    ).toBe("cb1438da-39bb-4f7f-8108-510fe91963e1");
  });
});

describe("extractResumeIdFromStdout (gemini --resume)", () => {
  it("extracts id after gemini --resume with space separator", () => {
    expect(
      extractResumeIdFromStdout(
        "Run: gemini --resume dd752a99-44df-4806-a088-5a1a38eb66f6 to continue"
      )
    ).toBe("dd752a99-44df-4806-a088-5a1a38eb66f6");
  });

  it("extracts id after gemini --resume= with equals separator", () => {
    expect(extractResumeIdFromStdout("gemini --resume=dd752a99-44df-4806-a088-5a1a38eb66f6")).toBe(
      "dd752a99-44df-4806-a088-5a1a38eb66f6"
    );
  });

  it("extracts id from a submitted shell line only (no surrounding scrollback)", () => {
    expect(
      extractResumeIdFromStdout("gemini --resume f4d46a49-0037-4c09-a698-a9675a2e0b46")
    ).toBe("f4d46a49-0037-4c09-a698-a9675a2e0b46");
  });

  it("extracts UUID from Session ID line with padded spaces (Gemini /status-style)", () => {
    expect(
      extractResumeIdFromStdout(
        "Session ID:                 f4d46a49-0037-4c09-a698-a9675a2e0b46"
      )
    ).toBe("f4d46a49-0037-4c09-a698-a9675a2e0b46");
  });
});

describe("extractResumeIdFromStdout (codex resume)", () => {
  it("extracts id after codex resume (subcommand, not --resume)", () => {
    expect(
      extractResumeIdFromStdout(
        "To continue: codex resume 3f8b9ee0-ae66-4e51-af69-ed99b7e15841"
      )
    ).toBe("3f8b9ee0-ae66-4e51-af69-ed99b7e15841");
  });

  it("extracts quoted id after codex resume", () => {
    expect(extractResumeIdFromStdout(`codex resume "3f8b9ee0-ae66-4e51-af69-ed99b7e15841"`)).toBe(
      "3f8b9ee0-ae66-4e51-af69-ed99b7e15841"
    );
  });
});
