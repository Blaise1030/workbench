"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
exports.deriveThreadTitleFromPrompt = deriveThreadTitleFromPrompt;
const node_crypto_1 = require("node:crypto");
const DEFAULT_THREAD_TITLES = {
    claude: "Claude Code",
    cursor: "Cursor Agent",
    codex: "Codex CLI",
    gemini: "Gemini CLI"
};
const MAX_DERIVED_TITLE_LENGTH = 68;
function deriveThreadTitleFromPrompt(input) {
    const firstLine = input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    if (!firstLine)
        return null;
    const normalized = firstLine
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized)
        return null;
    if (normalized.length <= MAX_DERIVED_TITLE_LENGTH)
        return normalized;
    const truncated = normalized.slice(0, MAX_DERIVED_TITLE_LENGTH - 3).trimEnd();
    const lastSpace = truncated.lastIndexOf(" ");
    const safe = lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated;
    return `${safe}...`;
}
function hasDefaultGeneratedTitle(thread) {
    const base = DEFAULT_THREAD_TITLES[thread.agent];
    return thread.title === base || thread.title.startsWith(`${base} · `);
}
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
            lastActiveWorktreeId: null,
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
            lastActiveThreadId: null,
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
            sortOrder: this.store.nextThreadSortOrder(input.worktreeId),
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
    maybeRenameThreadFromPrompt(threadId, input) {
        const nextTitle = deriveThreadTitleFromPrompt(input);
        if (!nextTitle)
            return false;
        const thread = this.store.getThread(threadId);
        if (!thread)
            return false;
        if (thread.createdAt !== thread.updatedAt)
            return false;
        if (!hasDefaultGeneratedTitle(thread))
            return false;
        if (thread.title === nextTitle)
            return false;
        this.store.renameThread(threadId, nextTitle);
        return true;
    }
    setActive(projectId, worktreeId, threadId) {
        this.store.setActiveState(projectId, worktreeId, threadId);
    }
    reorderThreads(worktreeId, orderedThreadIds) {
        this.store.reorderThreads(worktreeId, orderedThreadIds);
    }
}
exports.WorkspaceService = WorkspaceService;
