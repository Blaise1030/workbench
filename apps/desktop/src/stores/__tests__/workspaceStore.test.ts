import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { worktreeBranchNameContextLabel } from "../workspaceStore";
import type { Worktree } from "@shared/domain";

describe("workspaceStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("worktreeBranchNameContextLabel joins branch and worktree name when they differ", () => {
    const wt: Worktree = {
      id: "wt-1",
      projectId: "project-1",
      name: "Auth UI",
      branch: "feat/auth",
      path: "/tmp/wt",
      isActive: true,
      isDefault: false,
      baseBranch: "main",
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z"
    };
    expect(worktreeBranchNameContextLabel(wt)).toBe("feat/auth · Auth UI");
  });
});
