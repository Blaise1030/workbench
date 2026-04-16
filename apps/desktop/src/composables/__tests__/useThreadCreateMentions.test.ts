import { describe, expect, it } from "vitest";
import {
  isSkillLikePath,
  parseMentionAtCursor
} from "@/composables/useThreadCreateMentions";

describe("useThreadCreateMentions helpers", () => {
  it("parseMentionAtCursor detects active @ query before cursor", () => {
    expect(parseMentionAtCursor("hello @src/foo", 15)).toEqual({
      active: true,
      start: 6,
      query: "src/foo"
    });
    expect(parseMentionAtCursor("hello @", 7)).toEqual({ active: true, start: 6, query: "" });
  });

  it("parseMentionAtCursor is inactive after whitespace in query", () => {
    expect(parseMentionAtCursor("hello @a b", 11)).toEqual({ active: false });
  });

  it("isSkillLikePath matches common skill locations", () => {
    expect(isSkillLikePath(".claude/skills/foo/SKILL.md")).toBe(true);
    expect(isSkillLikePath(".codex/skills/bar/SKILL.md")).toBe(true);
    expect(isSkillLikePath(".gemini/skills/baz/SKILL.md")).toBe(true);
    expect(isSkillLikePath("lib/SKILL.md")).toBe(true);
    expect(isSkillLikePath("src/main.ts")).toBe(false);
  });
});
