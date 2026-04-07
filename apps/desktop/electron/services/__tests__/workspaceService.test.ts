import { describe, expect, it, vi } from "vitest";
import { WorkspaceService, deriveThreadTitleFromPrompt } from "../workspaceService";
import type { Thread } from "../../../src/shared/domain";

function buildThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    worktreeId: "worktree-1",
    title: "Codex CLI",
    agent: "codex",
    sortOrder: 0,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    ...overrides
  };
}

describe("deriveThreadTitleFromPrompt", () => {
  it("uses the first non-empty line and trims whitespace", () => {
    expect(deriveThreadTitleFromPrompt("\n  Fix the failing test suite  \n\nthen commit")).toBe(
      "Fix the failing test suite"
    );
  });

  it("collapses repeated whitespace and trims long prompts", () => {
    expect(
      deriveThreadTitleFromPrompt(
        "Implement     the   current   thread sidebar name behavior with enough extra text to exceed the trim limit"
      )
    ).toBe("Implement the current thread sidebar name behavior with enough...");
  });

  it("returns null for empty input", () => {
    expect(deriveThreadTitleFromPrompt(" \n\t\r ")).toBeNull();
  });
});

describe("WorkspaceService.maybeRenameThreadFromPrompt", () => {
  it("renames a default-titled thread from the first prompt", () => {
    const renameThread = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession: vi.fn(),
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread()),
      getThreadSession: vi.fn(() => null)
    };
    const service = new WorkspaceService(store as never);

    service.maybeRenameThreadFromPrompt("thread-1", "Refactor sidebar thread naming");

    expect(renameThread).toHaveBeenCalledWith("thread-1", "Refactor sidebar thread naming");
  });

  it("does not rename when the prompt is empty", () => {
    const renameThread = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession: vi.fn(),
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread()),
      getThreadSession: vi.fn(() => null)
    };
    const service = new WorkspaceService(store as never);

    service.maybeRenameThreadFromPrompt("thread-1", "   \n ");

    expect(renameThread).not.toHaveBeenCalled();
  });

  it("does not rename a manually titled thread", () => {
    const renameThread = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession: vi.fn(),
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() =>
        buildThread({
          title: "Investigate flaky auth flow",
          updatedAt: "2026-04-06T00:02:00.000Z"
        })
      ),
      getThreadSession: vi.fn(() => null)
    };
    const service = new WorkspaceService(store as never);

    service.maybeRenameThreadFromPrompt("thread-1", "Refactor sidebar thread naming");

    expect(renameThread).not.toHaveBeenCalled();
  });

  it("does not rename after the first prompt already changed the title", () => {
    const renameThread = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession: vi.fn(),
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() =>
        buildThread({
          title: "Refactor sidebar thread naming",
          updatedAt: "2026-04-06T00:01:00.000Z"
        })
      ),
      getThreadSession: vi.fn(() => null)
    };
    const service = new WorkspaceService(store as never);

    service.maybeRenameThreadFromPrompt("thread-1", "A later follow-up prompt");

    expect(renameThread).not.toHaveBeenCalled();
  });
});

describe("WorkspaceService.captureInitialPrompt", () => {
  it("renames once from the first captured prompt and persists session metadata", () => {
    const renameThread = vi.fn();
    const upsertThreadSession = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession,
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread()),
      getThreadSession: vi.fn(() => null)
    };
    const service = new WorkspaceService(store as never);

    const result = service.captureInitialPrompt("thread-1", "Refactor sidebar thread naming");

    expect(result).toEqual({
      renamed: true,
      initialPrompt: "Refactor sidebar thread naming"
    });
    expect(renameThread).toHaveBeenCalledWith("thread-1", "Refactor sidebar thread naming");
    expect(upsertThreadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        initialPrompt: "Refactor sidebar thread naming",
        titleCapturedAt: expect.any(String)
      })
    );
  });

  it("does not rename after the title has already been captured", () => {
    const renameThread = vi.fn();
    const upsertThreadSession = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession,
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread()),
      getThreadSession: vi.fn(() => ({
        threadId: "thread-1",
        provider: "codex",
        resumeId: null,
        initialPrompt: "Refactor sidebar thread naming",
        titleCapturedAt: "2026-04-06T00:01:00.000Z",
        launchMode: "fresh",
        status: "idle",
        lastActivityAt: "2026-04-06T00:01:00.000Z",
        metadataJson: null,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:01:00.000Z"
      }))
    };
    const service = new WorkspaceService(store as never);

    const result = service.captureInitialPrompt("thread-1", "A later follow-up prompt");

    expect(result).toEqual({
      renamed: false,
      initialPrompt: "Refactor sidebar thread naming"
    });
    expect(renameThread).not.toHaveBeenCalled();
    expect(upsertThreadSession).not.toHaveBeenCalled();
  });

  it("does not persist a bogus first prompt for a legacy already-renamed thread with no session row", () => {
    const renameThread = vi.fn();
    const upsertThreadSession = vi.fn();
    const getThreadSession = vi.fn(() => null);
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession,
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() =>
        buildThread({
          title: "Investigate flaky auth flow",
          updatedAt: "2026-04-06T00:01:00.000Z"
        })
      ),
      getThreadSession
    };
    const service = new WorkspaceService(store as never);

    const result = service.captureInitialPrompt("thread-1", "Follow-up prompt after rename");

    expect(result).toEqual({
      renamed: false,
      initialPrompt: null
    });
    expect(renameThread).not.toHaveBeenCalled();
    expect(upsertThreadSession).not.toHaveBeenCalled();
    expect(getThreadSession).toHaveBeenCalledWith("thread-1");
  });

  it("falls back to the current prompt when an existing session is missing initialPrompt", () => {
    const renameThread = vi.fn();
    const upsertThreadSession = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession,
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread()),
      getThreadSession: vi.fn(() => ({
        threadId: "thread-1",
        provider: "codex",
        resumeId: null,
        initialPrompt: null,
        titleCapturedAt: "2026-04-06T00:01:00.000Z",
        launchMode: "fresh",
        status: "idle",
        lastActivityAt: "2026-04-06T00:01:00.000Z",
        metadataJson: null,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:01:00.000Z"
      }))
    };
    const service = new WorkspaceService(store as never);

    const result = service.captureInitialPrompt("thread-1", "Fallback current prompt");

    expect(result).toEqual({
      renamed: false,
      initialPrompt: "Fallback current prompt"
    });
    expect(renameThread).not.toHaveBeenCalled();
    expect(upsertThreadSession).not.toHaveBeenCalled();
  });

  it("keeps the first-prompt truncation behavior unchanged", () => {
    const renameThread = vi.fn();
    const upsertThreadSession = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      upsertThreadSession,
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread()),
      getThreadSession: vi.fn(() => null)
    };
    const service = new WorkspaceService(store as never);

    const result = service.captureInitialPrompt(
      "thread-1",
      "Implement     the   current   thread sidebar name behavior with enough extra text to exceed the trim limit"
    );

    expect(result).toEqual({
      renamed: true,
      initialPrompt:
        "Implement     the   current   thread sidebar name behavior with enough extra text to exceed the trim limit"
    });
    expect(renameThread).toHaveBeenCalledWith(
      "thread-1",
      "Implement the current thread sidebar name behavior with enough..."
    );
  });
});

describe("WorkspaceService.createWorktreeGroup", () => {
  it("creates a worktree with isDefault false and baseBranch", async () => {
    const upsertWorktree = vi.fn();
    const setActiveState = vi.fn();
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [],
        threads: [],
        activeProjectId: "p1",
        activeWorktreeId: null,
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState,
      upsertWorktree,
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: vi.fn()
    };
    const mockGit = {
      worktreeAdd: vi.fn(async () => {}),
      branchList: vi.fn(async () => ["main", "develop"]),
      worktreeList: vi.fn(async () => []),
      worktreeRemove: vi.fn(),
      pathExists: vi.fn()
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    const result = await service.createWorktreeGroup({
      projectId: "p1",
      branch: "feat/auth",
      baseBranch: "main"
    });

    expect(result.isDefault).toBe(false);
    expect(result.baseBranch).toBe("main");
    expect(result.branch).toBe("feat/auth");
    expect(mockGit.worktreeAdd).toHaveBeenCalled();
    expect(upsertWorktree).toHaveBeenCalledWith(expect.objectContaining({
      isDefault: false,
      baseBranch: "main"
    }));
  });
});

describe("WorkspaceService.deleteWorktreeGroup", () => {
  it("removes git worktree and deletes store data", async () => {
    const deleteWorktreeGroupStore = vi.fn();
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [
          { id: "wt-default", projectId: "p1", path: "/tmp/repo", isDefault: true },
          { id: "wt-feat", projectId: "p1", path: "/tmp/repo/.worktrees/feat-auth", isDefault: false }
        ],
        threads: [],
        activeProjectId: "p1",
        activeWorktreeId: "wt-feat",
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: deleteWorktreeGroupStore
    };
    const mockGit = {
      worktreeAdd: vi.fn(),
      worktreeRemove: vi.fn(async () => {}),
      branchList: vi.fn(),
      worktreeList: vi.fn(async () => []),
      pathExists: vi.fn(async () => true)
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    await service.deleteWorktreeGroup("wt-feat");

    expect(mockGit.worktreeRemove).toHaveBeenCalledWith("/tmp/repo/.worktrees/feat-auth");
    expect(deleteWorktreeGroupStore).toHaveBeenCalledWith("wt-feat");
    expect(store.setActiveState).toHaveBeenCalledWith("p1", "wt-default", null);
  });
});

describe("WorkspaceService.listBranches", () => {
  it("returns branches from the git adapter", async () => {
    const mockGit = {
      worktreeAdd: vi.fn(),
      worktreeRemove: vi.fn(),
      branchList: vi.fn(async () => ["main", "develop", "feat/auth"]),
      worktreeList: vi.fn(async () => []),
      pathExists: vi.fn()
    };
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [],
        threads: [],
        activeProjectId: null,
        activeWorktreeId: null,
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: vi.fn()
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    const branches = await service.listBranches("p1");

    expect(branches).toEqual(["main", "develop", "feat/auth"]);
    expect(mockGit.branchList).toHaveBeenCalledWith("/tmp/repo");
  });
});

describe("WorkspaceService thread ordering", () => {
  it("assigns the next sort order when creating a thread", () => {
    const upsertThread = vi.fn();
    const setActiveState = vi.fn();
    const nextThreadSortOrder = vi.fn(() => 7);
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState,
      upsertWorktree: vi.fn(),
      upsertThread,
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder
    };
    const service = new WorkspaceService(store as never);

    const created = service.createThread({
      projectId: "project-1",
      worktreeId: "worktree-1",
      title: "New thread",
      agent: "codex"
    });

    expect(nextThreadSortOrder).toHaveBeenCalledWith("worktree-1");
    expect(upsertThread).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 7 }));
    expect(created.sortOrder).toBe(7);
    expect(setActiveState).toHaveBeenCalledWith("project-1", "worktree-1", created.id);
  });

  it("reorders threads for a worktree using ordered ids", () => {
    const reorderThreads = vi.fn();
    const store = {
      getSnapshot: vi.fn(),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads
    };
    const service = new WorkspaceService(store as never);

    service.reorderThreads("worktree-1", ["thread-2", "thread-1"]);

    expect(reorderThreads).toHaveBeenCalledWith("worktree-1", ["thread-2", "thread-1"]);
  });
});
