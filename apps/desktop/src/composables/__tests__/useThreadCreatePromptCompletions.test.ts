import { describe, expect, it } from "vitest";
import { parseSlashCommandAtCursor } from "@/composables/useThreadCreatePromptCompletions";

describe("parseSlashCommandAtCursor", () => {
  it("matches /command at the start of the prompt", () => {
    const text = "/review";
    const r = parseSlashCommandAtCursor(text, text.length);
    expect(r).toEqual({ active: true, start: 0, query: "review" });
  });

  it("matches after whitespace", () => {
    const text = "hello /fix";
    const r = parseSlashCommandAtCursor(text, text.length);
    expect(r).toEqual({ active: true, start: 6, query: "fix" });
  });

  it("does not treat path-like segments as commands", () => {
    const text = "see src/foo/bar";
    const r = parseSlashCommandAtCursor(text, text.length);
    expect(r.active).toBe(false);
  });

  it("does not match a slash inside a token", () => {
    const text = "ratio 1/2";
    const r = parseSlashCommandAtCursor(text, text.length);
    expect(r.active).toBe(false);
  });

  it("does not match when @ appears in the slash segment", () => {
    const text = "/@foo";
    const r = parseSlashCommandAtCursor(text, text.length);
    expect(r.active).toBe(false);
  });

  it("matches empty query after /", () => {
    const text = "/";
    const r = parseSlashCommandAtCursor(text, text.length);
    expect(r).toEqual({ active: true, start: 0, query: "" });
  });
});
