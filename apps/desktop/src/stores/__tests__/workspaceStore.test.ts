import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";
import type { Project, Thread, Worktree } from "@shared/domain";

function makeSnapshot() {
  const projects: Project[] = [
    {
      id: "project-1",
      name: "instrument",
      repoPath: "/tmp/instrument",
      status: "idle",
      tabOrder: 0,
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z"
    }
  ];
  const worktrees: Worktree[] = [
    {
      id: "worktree-default",
      projectId: "project-1",
      name: "main",
      branch: "main",
      path: "/tmp/instrument",
      isActive: true,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: "thread-default-1",
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z"
    },
    {
      id: "worktree-feature",
      projectId: "project-1",
      name: "feat/auth",
      branch: "feat/auth",
      path: "/tmp/instrument/.worktrees/feat-auth",
      isActive: false,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: "thread-feature-1",
      createdAt: "2026-04-07T00:01:00.000Z",
      updatedAt: "2026-04-07T00:01:00.000Z"
    },
    {
      id: "worktree-refactor",
      projectId: "project-1",
      name: "feat/refactor",
      branch: "feat/refactor",
      path: "/tmp/instrument/.worktrees/feat-refactor",
      isActive: false,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:02:00.000Z",
      updatedAt: "2026-04-07T00:02:00.000Z"
    }
  ];
  const threads: Thread[] = [
    {
      id: "thread-default-1",
      projectId: "project-1",
      worktreeId: "worktree-default",
      title: "Codex CLI · main",
      agent: "codex",
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z"
    },
    {
      id: "thread-feature-1",
      projectId: "project-1",
      worktreeId: "worktree-feature",
      title: "Claude Code · auth",
      agent: "claude",
      createdAt: "2026-04-07T00:01:00.000Z",
      updatedAt: "2026-04-07T00:01:00.000Z"
    },
    {
      id: "thread-feature-2",
      projectId: "project-1",
      worktreeId: "worktree-feature",
      title: "Gemini CLI · review",
      agent: "gemini",
      createdAt: "2026-04-07T00:02:00.000Z",
      updatedAt: "2026-04-07T00:02:00.000Z"
    },
    {
      id: "thread-refactor-1",
      projectId: "project-1",
      worktreeId: "worktree-refactor",
      title: "Cursor · cleanup",
      agent: "cursor",
      createdAt: "2026-04-07T00:03:00.000Z",
      updatedAt: "2026-04-07T00:03:00.000Z"
    }
  ];

  return {
    projects,
    worktrees,
    threads,
    activeProjectId: "project-1",
    activeWorktreeId: "worktree-default",
    activeThreadId: "thread-default-1"
  };
}

describe("workspaceStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("orders grouped contexts with the default worktree first and labels it Primary", () => {
    const store = useWorkspaceStore();
    store.hydrate(makeSnapshot());

    expect(store.threadContexts.map((context) => context.displayLabel)).toEqual([
      "Primary",
      "feat/auth",
      "feat/refactor"
    ]);
    expect(store.threadContexts[0]?.isDefault).toBe(true);
    expect(store.threadContexts[0]?.worktreeId).toBe("worktree-default");
  });

  it("partitions threads by worktreeId", () => {
    const store = useWorkspaceStore();
    store.hydrate(makeSnapshot());

    expect(store.groupedThreadsByWorktree.get("worktree-feature")?.map((thread) => thread.id)).toEqual([
      "thread-feature-2",
      "thread-feature-1"
    ]);
    expect(store.groupedThreadsByWorktree.get("worktree-refactor")?.map((thread) => thread.id)).toEqual([
      "thread-refactor-1"
    ]);
    expect(store.groupedThreadsByWorktree.has("worktree-default")).toBe(false);
    expect(store.ungroupedThreads.map((thread) => thread.id)).toEqual(["thread-default-1"]);
  });

  it("exposes active context badge data for the default worktree as Primary", () => {
    const store = useWorkspaceStore();
    store.hydrate(makeSnapshot());

    expect(store.activeContextBadge).toEqual({
      worktreeId: "worktree-default",
      displayLabel: "Primary",
      isDefault: true,
      threadCount: 1
    });
  });
});
