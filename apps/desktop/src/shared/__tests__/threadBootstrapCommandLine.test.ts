import { describe, expect, it } from "vitest";
import { shellDoubleQuotedArg, threadBootstrapCommandLine } from "../threadBootstrapCommandLine";

describe("threadBootstrapCommandLine", () => {
  it("escapes double quotes and shell metacharacters in double-quoted args", () => {
    expect(shellDoubleQuotedArg(`say "hi"`)).toBe(`"say \\"hi\\""`);
    expect(shellDoubleQuotedArg("a$b")).toBe(`"a\\$b"`);
  });

  it("returns base only when prompt is empty or whitespace", () => {
    expect(threadBootstrapCommandLine("claude", "")).toBe("claude");
    expect(threadBootstrapCommandLine("claude", "   ")).toBe("claude");
    expect(threadBootstrapCommandLine("cursor agent", "\n")).toBe("cursor agent");
  });

  it("appends double-quoted prompt for non-empty input", () => {
    expect(threadBootstrapCommandLine("claude", "fix bug")).toBe(`claude "fix bug"`);
    expect(threadBootstrapCommandLine("cursor agent", "hello")).toBe(`cursor agent "hello"`);
  });
});
