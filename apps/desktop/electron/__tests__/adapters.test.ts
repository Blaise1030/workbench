import { describe, it, expect } from "vitest";
import { ClaudeCodeCliAdapter } from "../adapters/claudeCodeCliAdapter.js";
import { GeminiCliAdapter } from "../adapters/geminiCliAdapter.js";

describe("ClaudeCodeCliAdapter.command", () => {
  it("places -- before the prompt so flag-like prompts are not parsed as flags", () => {
    const adapter = new ClaudeCodeCliAdapter();
    const result = adapter.command({ cwd: "/project", prompt: "--dangerous-flag do evil", threadId: "t1" });
    expect(result.args).toContain("--");
    const dashDashIdx = result.args.indexOf("--");
    const promptIdx = result.args.indexOf("--dangerous-flag do evil");
    expect(promptIdx).toBeGreaterThan(dashDashIdx);
  });

  it("passes cwd via --cwd flag", () => {
    const adapter = new ClaudeCodeCliAdapter();
    const result = adapter.command({ cwd: "/my/project", prompt: "hello", threadId: "t1" });
    expect(result.args).toContain("--cwd");
    expect(result.args[result.args.indexOf("--cwd") + 1]).toBe("/my/project");
  });
});

describe("GeminiCliAdapter.command", () => {
  it("places -- before the prompt", () => {
    const adapter = new GeminiCliAdapter();
    const result = adapter.command({ cwd: "/project", prompt: "--inject", threadId: "t1" });
    expect(result.args).toContain("--");
    const dashDashIdx = result.args.indexOf("--");
    const promptIdx = result.args.indexOf("--inject");
    expect(promptIdx).toBeGreaterThan(dashDashIdx);
  });
});
