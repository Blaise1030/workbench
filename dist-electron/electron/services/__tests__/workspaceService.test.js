"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const workspaceService_1 = require("../workspaceService");
function buildThread(overrides = {}) {
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
(0, vitest_1.describe)("deriveThreadTitleFromPrompt", () => {
    (0, vitest_1.it)("uses the first non-empty line and trims whitespace", () => {
        (0, vitest_1.expect)((0, workspaceService_1.deriveThreadTitleFromPrompt)("\n  Fix the failing test suite  \n\nthen commit")).toBe("Fix the failing test suite");
    });
    (0, vitest_1.it)("collapses repeated whitespace and trims long prompts", () => {
        (0, vitest_1.expect)((0, workspaceService_1.deriveThreadTitleFromPrompt)("Implement     the   current   thread sidebar name behavior with enough extra text to exceed the trim limit")).toBe("Implement the current thread sidebar name behavior with enough...");
    });
    (0, vitest_1.it)("returns null for empty input", () => {
        (0, vitest_1.expect)((0, workspaceService_1.deriveThreadTitleFromPrompt)(" \n\t\r ")).toBeNull();
    });
});
(0, vitest_1.describe)("WorkspaceService.maybeRenameThreadFromPrompt", () => {
    (0, vitest_1.it)("renames a default-titled thread from the first prompt", () => {
        const renameThread = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(),
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread,
            getThread: vitest_1.vi.fn(() => buildThread())
        };
        const service = new workspaceService_1.WorkspaceService(store);
        service.maybeRenameThreadFromPrompt("thread-1", "Refactor sidebar thread naming");
        (0, vitest_1.expect)(renameThread).toHaveBeenCalledWith("thread-1", "Refactor sidebar thread naming");
    });
    (0, vitest_1.it)("does not rename when the prompt is empty", () => {
        const renameThread = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(),
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread,
            getThread: vitest_1.vi.fn(() => buildThread())
        };
        const service = new workspaceService_1.WorkspaceService(store);
        service.maybeRenameThreadFromPrompt("thread-1", "   \n ");
        (0, vitest_1.expect)(renameThread).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("does not rename a manually titled thread", () => {
        const renameThread = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(),
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread,
            getThread: vitest_1.vi.fn(() => buildThread({
                title: "Investigate flaky auth flow",
                updatedAt: "2026-04-06T00:02:00.000Z"
            }))
        };
        const service = new workspaceService_1.WorkspaceService(store);
        service.maybeRenameThreadFromPrompt("thread-1", "Refactor sidebar thread naming");
        (0, vitest_1.expect)(renameThread).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("does not rename after the first prompt already changed the title", () => {
        const renameThread = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(),
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread,
            getThread: vitest_1.vi.fn(() => buildThread({
                title: "Refactor sidebar thread naming",
                updatedAt: "2026-04-06T00:01:00.000Z"
            }))
        };
        const service = new workspaceService_1.WorkspaceService(store);
        service.maybeRenameThreadFromPrompt("thread-1", "A later follow-up prompt");
        (0, vitest_1.expect)(renameThread).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)("WorkspaceService.createWorktreeGroup", () => {
    (0, vitest_1.it)("creates a worktree with isDefault false and baseBranch", async () => {
        const upsertWorktree = vitest_1.vi.fn();
        const setActiveState = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(() => ({
                projects: [{ id: "p1", repoPath: "/tmp/repo" }],
                worktrees: [],
                threads: [],
                activeProjectId: "p1",
                activeWorktreeId: null,
                activeThreadId: null
            })),
            upsertProject: vitest_1.vi.fn(),
            setActiveState,
            upsertWorktree,
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread: vitest_1.vi.fn(),
            getThread: vitest_1.vi.fn(),
            nextThreadSortOrder: vitest_1.vi.fn(),
            reorderThreads: vitest_1.vi.fn(),
            deleteWorktreeGroup: vitest_1.vi.fn()
        };
        const mockGit = {
            worktreeAdd: vitest_1.vi.fn(async () => { }),
            branchList: vitest_1.vi.fn(async () => ["main", "develop"]),
            worktreeList: vitest_1.vi.fn(async () => []),
            worktreeRemove: vitest_1.vi.fn(),
            pathExists: vitest_1.vi.fn()
        };
        const service = new workspaceService_1.WorkspaceService(store, mockGit);
        const result = await service.createWorktreeGroup({
            projectId: "p1",
            branch: "feat/auth",
            baseBranch: "main"
        });
        (0, vitest_1.expect)(result.isDefault).toBe(false);
        (0, vitest_1.expect)(result.baseBranch).toBe("main");
        (0, vitest_1.expect)(result.branch).toBe("feat/auth");
        (0, vitest_1.expect)(mockGit.worktreeAdd).toHaveBeenCalled();
        (0, vitest_1.expect)(upsertWorktree).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            isDefault: false,
            baseBranch: "main"
        }));
    });
});
(0, vitest_1.describe)("WorkspaceService.deleteWorktreeGroup", () => {
    (0, vitest_1.it)("removes git worktree and deletes store data", async () => {
        const deleteWorktreeGroupStore = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(() => ({
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
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread: vitest_1.vi.fn(),
            getThread: vitest_1.vi.fn(),
            nextThreadSortOrder: vitest_1.vi.fn(),
            reorderThreads: vitest_1.vi.fn(),
            deleteWorktreeGroup: deleteWorktreeGroupStore
        };
        const mockGit = {
            worktreeAdd: vitest_1.vi.fn(),
            worktreeRemove: vitest_1.vi.fn(async () => { }),
            branchList: vitest_1.vi.fn(),
            worktreeList: vitest_1.vi.fn(async () => []),
            pathExists: vitest_1.vi.fn(async () => true)
        };
        const service = new workspaceService_1.WorkspaceService(store, mockGit);
        await service.deleteWorktreeGroup("wt-feat");
        (0, vitest_1.expect)(mockGit.worktreeRemove).toHaveBeenCalledWith("/tmp/repo/.worktrees/feat-auth");
        (0, vitest_1.expect)(deleteWorktreeGroupStore).toHaveBeenCalledWith("wt-feat");
        (0, vitest_1.expect)(store.setActiveState).toHaveBeenCalledWith("p1", "wt-default", null);
    });
});
(0, vitest_1.describe)("WorkspaceService.listBranches", () => {
    (0, vitest_1.it)("returns branches from the git adapter", async () => {
        const mockGit = {
            worktreeAdd: vitest_1.vi.fn(),
            worktreeRemove: vitest_1.vi.fn(),
            branchList: vitest_1.vi.fn(async () => ["main", "develop", "feat/auth"]),
            worktreeList: vitest_1.vi.fn(async () => []),
            pathExists: vitest_1.vi.fn()
        };
        const store = {
            getSnapshot: vitest_1.vi.fn(() => ({
                projects: [{ id: "p1", repoPath: "/tmp/repo" }],
                worktrees: [],
                threads: [],
                activeProjectId: null,
                activeWorktreeId: null,
                activeThreadId: null
            })),
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread: vitest_1.vi.fn(),
            getThread: vitest_1.vi.fn(),
            nextThreadSortOrder: vitest_1.vi.fn(),
            reorderThreads: vitest_1.vi.fn(),
            deleteWorktreeGroup: vitest_1.vi.fn()
        };
        const service = new workspaceService_1.WorkspaceService(store, mockGit);
        const branches = await service.listBranches("p1");
        (0, vitest_1.expect)(branches).toEqual(["main", "develop", "feat/auth"]);
        (0, vitest_1.expect)(mockGit.branchList).toHaveBeenCalledWith("/tmp/repo");
    });
});
(0, vitest_1.describe)("WorkspaceService thread ordering", () => {
    (0, vitest_1.it)("assigns the next sort order when creating a thread", () => {
        const upsertThread = vitest_1.vi.fn();
        const setActiveState = vitest_1.vi.fn();
        const nextThreadSortOrder = vitest_1.vi.fn(() => 7);
        const store = {
            getSnapshot: vitest_1.vi.fn(),
            upsertProject: vitest_1.vi.fn(),
            setActiveState,
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread,
            deleteThread: vitest_1.vi.fn(),
            renameThread: vitest_1.vi.fn(),
            getThread: vitest_1.vi.fn(),
            nextThreadSortOrder
        };
        const service = new workspaceService_1.WorkspaceService(store);
        const created = service.createThread({
            projectId: "project-1",
            worktreeId: "worktree-1",
            title: "New thread",
            agent: "codex"
        });
        (0, vitest_1.expect)(nextThreadSortOrder).toHaveBeenCalledWith("worktree-1");
        (0, vitest_1.expect)(upsertThread).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ sortOrder: 7 }));
        (0, vitest_1.expect)(created.sortOrder).toBe(7);
        (0, vitest_1.expect)(setActiveState).toHaveBeenCalledWith("project-1", "worktree-1", created.id);
    });
    (0, vitest_1.it)("reorders threads for a worktree using ordered ids", () => {
        const reorderThreads = vitest_1.vi.fn();
        const store = {
            getSnapshot: vitest_1.vi.fn(),
            upsertProject: vitest_1.vi.fn(),
            setActiveState: vitest_1.vi.fn(),
            upsertWorktree: vitest_1.vi.fn(),
            upsertThread: vitest_1.vi.fn(),
            deleteThread: vitest_1.vi.fn(),
            renameThread: vitest_1.vi.fn(),
            getThread: vitest_1.vi.fn(),
            nextThreadSortOrder: vitest_1.vi.fn(),
            reorderThreads
        };
        const service = new workspaceService_1.WorkspaceService(store);
        service.reorderThreads("worktree-1", ["thread-2", "thread-1"]);
        (0, vitest_1.expect)(reorderThreads).toHaveBeenCalledWith("worktree-1", ["thread-2", "thread-1"]);
    });
});
