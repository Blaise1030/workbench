"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const node_crypto_1 = require("node:crypto");
class WorkspaceService {
    store;
    constructor(store) {
        this.store = store;
    }
    getSnapshot() {
        return this.store.getSnapshot();
    }
    addProject(name, repoPath) {
        const now = new Date().toISOString();
        const project = {
            id: (0, node_crypto_1.randomUUID)(),
            name,
            repoPath,
            status: "idle",
            createdAt: now,
            updatedAt: now
        };
        this.store.upsertProject(project);
        this.store.setActiveState(project.id, null, null);
        return project;
    }
    addWorktree(projectId, branch, worktreePath) {
        const now = new Date().toISOString();
        const worktree = {
            id: (0, node_crypto_1.randomUUID)(),
            projectId,
            name: branch,
            branch,
            path: worktreePath,
            isActive: true,
            createdAt: now,
            updatedAt: now
        };
        this.store.upsertWorktree(worktree);
        this.store.setActiveState(projectId, worktree.id, null);
        return worktree;
    }
    createThread(input) {
        const now = new Date().toISOString();
        const thread = {
            id: (0, node_crypto_1.randomUUID)(),
            projectId: input.projectId,
            worktreeId: input.worktreeId,
            title: input.title,
            agent: input.agent,
            createdAt: now,
            updatedAt: now
        };
        this.store.upsertThread(thread);
        this.store.setActiveState(input.projectId, input.worktreeId, thread.id);
        return thread;
    }
    deleteThread(threadId) {
        this.store.deleteThread(threadId);
    }
    renameThread(threadId, title) {
        this.store.renameThread(threadId, title);
    }
    setActive(projectId, worktreeId, threadId) {
        this.store.setActiveState(projectId, worktreeId, threadId);
    }
}
exports.WorkspaceService = WorkspaceService;
