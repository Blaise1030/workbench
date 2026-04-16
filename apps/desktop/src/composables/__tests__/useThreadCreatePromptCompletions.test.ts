import { describe, expect, it } from "vitest";
import { THREAD_AGENT_SKILL_ROOT_DEFAULT } from "@shared/threadAgentSkillRoots";
import {
  AGENT_SKILLS_DIRECTORY_NAME,
  parseSlashCommandAtCursor,
  skillDisplayLabelFromRelativePath
} from "@/composables/useThreadCreatePromptCompletions";

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

describe("skillDisplayLabelFromRelativePath", () => {
  it("uses the parent folder of SKILL.md as the display name", () => {
    expect(skillDisplayLabelFromRelativePath(".claude/skills/flight-dev/SKILL.md")).toBe("flight-dev");
    expect(skillDisplayLabelFromRelativePath("skills/foo/skill.md")).toBe("foo");
  });

  it("falls back to the last segment when there is no SKILL.md", () => {
    expect(skillDisplayLabelFromRelativePath("lib/helpers.ts")).toBe("helpers.ts");
  });
});

describe("agent skill roots", () => {
  it("uses a shared skills directory name under each agent folder", () => {
    expect(AGENT_SKILLS_DIRECTORY_NAME).toBe("skills");
  });

  it("defaults each agent to a ~/…/skills path for slash-menu search", () => {
    expect(THREAD_AGENT_SKILL_ROOT_DEFAULT.claude).toBe("~/.claude/skills");
    expect(THREAD_AGENT_SKILL_ROOT_DEFAULT.cursor).toBe("~/.cursor/skills");
    expect(THREAD_AGENT_SKILL_ROOT_DEFAULT.codex).toBe("~/.codex/skills");
    expect(THREAD_AGENT_SKILL_ROOT_DEFAULT.gemini).toBe("~/.gemini/skills");
  });
});
