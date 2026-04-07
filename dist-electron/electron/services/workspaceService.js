"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
exports.deriveThreadTitleFromPrompt = deriveThreadTitleFromPrompt;
const node_crypto_1 = require("node:crypto");
const node_path_1 = __importDefault(require("node:path"));
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
    git;
    constructor(store, git) {
        this.store = store;
        this.git = git;
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
    addWorktree(projectId, branch, worktreePath, isDefault = false) {
        const now = new Date().toISOString();
        const worktree = {
            id: (0, node_crypto_1.randomUUID)(),
            projectId,
            name: branch,
            branch,
            path: worktreePath,
            isActive: true,
            isDefault,
            baseBranch: null,
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
    async createWorktreeGroup(input) {
        if (!this.git)
            throw new Error("Git adapter required for worktree operations");
        const snapshot = this.store.getSnapshot();
        const project = snapshot.projects.find((p) => p.id === input.projectId);
        if (!project)
            throw new Error(`Project ${input.projectId} not found`);
        const sanitized = input.branch.replace(/\//g, "-");
        const worktreePath = node_path_1.default.join(project.repoPath, ".worktrees", sanitized);
        await this.git.worktreeAdd(project.repoPath, worktreePath, input.branch, input.baseBranch);
        const now = new Date().toISOString();
        const worktree = {
            id: (0, node_crypto_1.randomUUID)(),
            projectId: input.projectId,
            name: input.branch,
            branch: input.branch,
            path: worktreePath,
            isActive: true,
            isDefault: false,
            baseBranch: input.baseBranch,
            lastActiveThreadId: null,
            createdAt: now,
            updatedAt: now
        };
        this.store.upsertWorktree(worktree);
        return worktree;
    }
    async deleteWorktreeGroup(worktreeId) {
        if (!this.git)
            throw new Error("Git adapter required for worktree operations");
        const snapshot = this.store.getSnapshot();
        const worktree = snapshot.worktrees.find((w) => w.id === worktreeId);
        if (!worktree)
            throw new Error(`Worktree ${worktreeId} not found`);
        if (worktree.isDefault)
            throw new Error("Cannot delete the default worktree");
        const exists = await this.git.pathExists(worktree.path);
        if (exists) {
            await this.git.worktreeRemove(worktree.path);
        }
        this.store.deleteWorktreeGroup(worktreeId);
        if (snapshot.activeWorktreeId === worktreeId) {
            const defaultWt = snapshot.worktrees.find((w) => w.projectId === worktree.projectId && w.isDefault);
            if (defaultWt) {
                this.store.setActiveState(worktree.projectId, defaultWt.id, null);
            }
        }
    }
    async listBranches(projectId) {
        if (!this.git)
            throw new Error("Git adapter required for worktree operations");
        const snapshot = this.store.getSnapshot();
        const project = snapshot.projects.find((p) => p.id === projectId);
        if (!project)
            throw new Error(`Project ${projectId} not found`);
        return this.git.branchList(project.repoPath);
    }
    async checkWorktreeHealth(worktreeId) {
        if (!this.git)
            throw new Error("Git adapter required");
        const snapshot = this.store.getSnapshot();
        const worktree = snapshot.worktrees.find((w) => w.id === worktreeId);
        if (!worktree)
            return { exists: false };
        const exists = await this.git.pathExists(worktree.path);
        return { exists };
    }
    /**
     * Discovers git worktrees on disk that are not tracked in the DB
     * and imports them as non-default worktree groups.
     */
    async syncWorktrees(projectId) {
        if (!this.git)
            return false;
        const snapshot = this.store.getSnapshot();
        const project = snapshot.projects.find((p) => p.id === projectId);
        if (!project)
            return false;
        const gitWorktrees = await this.git.worktreeList(project.repoPath);
        const knownPaths = new Set(snapshot.worktrees
            .filter((w) => w.projectId === projectId)
            .map((w) => w.path));
        let imported = false;
        const now = new Date().toISOString();
        for (const entry of gitWorktrees) {
            // Skip the main worktree (same as repoPath) and already-tracked worktrees
            if (entry.path === project.repoPath || knownPaths.has(entry.path))
                continue;
            const worktree = {
                id: (0, node_crypto_1.randomUUID)(),
                projectId,
                name: entry.branch,
                branch: entry.branch,
                path: entry.path,
                isActive: true,
                isDefault: false,
                baseBranch: null,
                lastActiveThreadId: null,
                createdAt: now,
                updatedAt: now
            };
            this.store.upsertWorktree(worktree);
            imported = true;
        }
        return imported;
    }
}
exports.WorkspaceService = WorkspaceService;
