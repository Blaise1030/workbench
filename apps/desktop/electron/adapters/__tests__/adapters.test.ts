import { describe, expect, it } from "vitest";
import { ClaudeCodeCliAdapter } from "../claudeCodeCliAdapter";
import { CodexCliAdapter } from "../codexCliAdapter";
import { CursorCliAdapter } from "../cursorCliAdapter";
import { GeminiCliAdapter } from "../geminiCliAdapter";

describe("agent adapters", () => {
  it("claude adapter returns correct command", () => {
    const adapter = new ClaudeCodeCliAdapter();
    const cmd = adapter.command({ cwd: "/repo", prompt: "fix bug", threadId: "t1" });
    expect(cmd.file).toBe("claude");
    expect(cmd.args).toContain("fix bug");
  });

  it("codex adapter returns correct command", () => {
    const adapter = new CodexCliAdapter();
    const cmd = adapter.command({ cwd: "/repo", prompt: "fix bug", threadId: "t1" });
    expect(cmd.file).toBe("codex");
    expect(cmd.args).toContain("fix bug");
  });

  it("gemini adapter returns correct command", () => {
    const adapter = new GeminiCliAdapter();
    const cmd = adapter.command({ cwd: "/repo", prompt: "fix bug", threadId: "t1" });
    expect(cmd.file).toBe("gemini");
    expect(cmd.args).toContain("fix bug");
  });

  it("cursor adapter returns correct command", () => {
    const adapter = new CursorCliAdapter();
    const cmd = adapter.command({ cwd: "/repo", prompt: "fix bug", threadId: "t1" });
    expect(cmd.file).toBe("cursor");
    expect(cmd.args).toContain("fix bug");
  });
});
