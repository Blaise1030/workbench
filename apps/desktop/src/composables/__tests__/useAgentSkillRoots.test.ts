import { describe, expect, it } from "vitest";
import { expandUserSkillRoot } from "@/composables/useAgentSkillRoots";

describe("expandUserSkillRoot", () => {
  it("expands ~/ with a home prefix", () => {
    expect(expandUserSkillRoot("~/.claude/skills", "/Users/me")).toBe("/Users/me/.claude/skills");
  });

  it("returns null for ~/ when home is unknown", () => {
    expect(expandUserSkillRoot("~/.claude/skills", null)).toBeNull();
  });

  it("passes through absolute paths", () => {
    expect(expandUserSkillRoot("/opt/skills", "/Users/me")).toBe("/opt/skills");
  });

  it("returns null for blank input", () => {
    expect(expandUserSkillRoot("  ", "/Users/me")).toBeNull();
  });
});
