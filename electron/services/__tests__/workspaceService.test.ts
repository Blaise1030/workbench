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
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread())
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
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() => buildThread())
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
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() =>
        buildThread({
          title: "Investigate flaky auth flow",
          updatedAt: "2026-04-06T00:02:00.000Z"
        })
      )
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
      deleteThread: vi.fn(),
      renameThread,
      getThread: vi.fn(() =>
        buildThread({
          title: "Refactor sidebar thread naming",
          updatedAt: "2026-04-06T00:01:00.000Z"
        })
      )
    };
    const service = new WorkspaceService(store as never);

    service.maybeRenameThreadFromPrompt("thread-1", "A later follow-up prompt");

    expect(renameThread).not.toHaveBeenCalled();
  });
});
