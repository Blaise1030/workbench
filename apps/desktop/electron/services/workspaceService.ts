import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Project, Thread, ThreadAgent, Worktree } from "../../src/shared/domain.js";
import { isValidResumeSessionId } from "../../src/shared/resumeSessionId.js";
import type { CreateThreadInput, CreateWorktreeGroupInput, WorkspaceSnapshot } from "../../src/shared/ipc.js";
import { WorkspaceStore } from "../storage/store.js";

export interface GitAdapter {
  worktreeAdd(repoPath: string, worktreePath: string, branch: string, baseBranch: string | null): Promise<void>;
  worktreeRemove(worktreePath: string): Promise<void>;
  worktreeList(repoPath: string): Promise<Array<{ path: string; branch: string }>>;
  branchList(repoPath: string): Promise<string[]>;
  pathExists(fsPath: string): Promise<boolean>;
}

const DEFAULT_THREAD_TITLES: Record<Thread["agent"], string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};
const MAX_DERIVED_TITLE_LENGTH = 68;

// Preserve the raw first prompt, collapse whitespace, and truncate once.
export function deriveThreadTitleFromPrompt(input: string): string | null {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const normalized = firstLine
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_DERIVED_TITLE_LENGTH) return normalized;

  const truncated = normalized.slice(0, MAX_DERIVED_TITLE_LENGTH - 3).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  const safe = lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated;
  return `${safe}...`;
}

function hasDefaultGeneratedTitle(thread: Thread): boolean {
  const base = DEFAULT_THREAD_TITLES[thread.agent];
  return thread.title === base || thread.title.startsWith(`${base} · `);
}

export class WorkspaceService {
  constructor(
    private store: WorkspaceStore,
    private git?: GitAdapter
  ) {}

  getSnapshot(): WorkspaceSnapshot {
    return this.store.getSnapshot();
  }

  addProject(name: string, repoPath: string): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name,
      repoPath,
      status: "idle",
      lastActiveWorktreeId: null,
      tabOrder: this.store.nextProjectTabOrder(),
      createdAt: now,
      updatedAt: now
    };
    this.store.upsertProject(project);
    this.store.setActiveState(project.id, null, null);
    return project;
  }

  reorderProjects(orderedProjectIds: string[]): void {
    this.store.reorderProjects(orderedProjectIds);
  }

  removeProject(projectId: string): void {
    this.store.deleteProject(projectId);
  }

  addWorktree(projectId: string, branch: string, worktreePath: string, isDefault = false): Worktree {
    const now = new Date().toISOString();
    const worktree: Worktree = {
      id: randomUUID(),
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

  /**
   * @param createdBranchOverride When set (including `null`), persisted as `createdBranch` instead of the
   *   worktree row's `branch` (used by main process after reading `HEAD` from disk so it matches SCM state).
   */
  createThread(input: CreateThreadInput, createdBranchOverride?: string | null): Thread {
    const now = new Date().toISOString();
    const worktree = this.store.getSnapshot().worktrees.find((w) => w.id === input.worktreeId);
    const createdBranch =
      createdBranchOverride !== undefined ? createdBranchOverride : (worktree?.branch ?? null);
    const thread: Thread = {
      id: randomUUID(),
      projectId: input.projectId,
      worktreeId: input.worktreeId,
      title: input.title,
      agent: input.agent,
      createdBranch,
      createdAt: now,
      updatedAt: now
    };
    this.store.upsertThread(thread);
    this.store.setActiveState(input.projectId, input.worktreeId, thread.id);
    return thread;
  }

  deleteThread(threadId: string): void {
    this.store.deleteThread(threadId);
  }

  renameThread(threadId: string, title: string): void {
    this.store.renameThread(threadId, title);
  }

  updateThread(threadId: string, updates: { title?: string; agent?: ThreadAgent }): void {
    const thread = this.store.getThread(threadId);
    if (!thread) return;

    const now = new Date().toISOString();
    this.store.upsertThread({
      ...thread,
      title: updates.title ?? thread.title,
      agent: updates.agent ?? thread.agent,
      updatedAt: now
    });
  }

  captureInitialPrompt(threadId: string, input: string): { renamed: boolean; captured: boolean; initialPrompt: string | null } {
    const nextTitle = deriveThreadTitleFromPrompt(input);
    if (!nextTitle) return { renamed: false, captured: false, initialPrompt: null };

    const thread = this.store.getThread(threadId);
    if (!thread) return { renamed: false, captured: false, initialPrompt: null };

    const existingSession = this.store.getThreadSession(threadId);
    if (existingSession?.titleCapturedAt) {
      return {
        renamed: false,
        captured: false,
        initialPrompt: existingSession.initialPrompt
      };
    }

    if (!hasDefaultGeneratedTitle(thread)) {
      return {
        renamed: false,
        captured: false,
        initialPrompt: null
      };
    }

    const now = new Date().toISOString();
    const initialPrompt = existingSession?.initialPrompt ?? input;
    this.store.upsertThreadSession({
      threadId,
      provider: thread.agent,
      resumeId: existingSession?.resumeId ?? null,
      initialPrompt,
      titleCapturedAt: existingSession?.titleCapturedAt ?? now,
      launchMode: existingSession?.launchMode ?? "fresh",
      status: existingSession?.status ?? "idle",
      lastActivityAt: existingSession?.lastActivityAt ?? now,
      metadataJson: existingSession?.metadataJson ?? null,
      createdAt: existingSession?.createdAt ?? now,
      updatedAt: now
    });

    if (thread.title === nextTitle) {
      return {
        renamed: false,
        captured: true,
        initialPrompt
      };
    }

    this.store.renameThread(threadId, nextTitle);
    return {
      renamed: true,
      captured: true,
      initialPrompt
    };
  }

  maybeRenameThreadFromPrompt(threadId: string, input: string): boolean {
    const result = this.captureInitialPrompt(threadId, input);
    return result.renamed || result.captured;
  }

  /**
   * Persists the detected provider resume/session id for a thread (e.g. from
   * `cursor agent --resume=<uuid>`). Skips invalid strings. If a valid id is
   * already stored, does nothing (including when the new id differs). If the
   * stored id is missing or not a valid UUID, replaces it with the new valid id.
   */
  captureResumeId(threadId: string, resumeId: string): boolean {
    const thread = this.store.getThread(threadId);
    if (!thread) return false;

    const trimmed = resumeId.trim();
    if (!isValidResumeSessionId(trimmed)) return false;

    const existing = this.store.getThreadSession(threadId);
    const stored = existing?.resumeId?.trim() ?? "";
    const hasValidStored = stored !== "" && isValidResumeSessionId(stored);
    if (hasValidStored) return false;

    const now = new Date().toISOString();
    this.store.upsertThreadSession({
      threadId,
      provider: thread.agent,
      resumeId: trimmed,
      initialPrompt: existing?.initialPrompt ?? null,
      titleCapturedAt: existing?.titleCapturedAt ?? null,
      launchMode: existing?.launchMode ?? "fresh",
      status: "resumable",
      lastActivityAt: existing?.lastActivityAt ?? now,
      metadataJson: existing?.metadataJson ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    return true;
  }

  setActive(projectId: string | null, worktreeId: string | null, threadId: string | null): void {
    this.store.setActiveState(projectId, worktreeId, threadId);
  }

  async createWorktreeGroup(input: CreateWorktreeGroupInput): Promise<Worktree> {
    if (!this.git) throw new Error("Git adapter required for worktree operations");

    const snapshot = this.store.getSnapshot();
    const project = snapshot.projects.find((p) => p.id === input.projectId);
    if (!project) throw new Error(`Project ${input.projectId} not found`);

    const sanitized = input.branch.replace(/\//g, "-");
    const worktreePath = path.join(project.repoPath, ".worktrees", sanitized);

    await this.git.worktreeAdd(project.repoPath, worktreePath, input.branch, input.baseBranch);

    const now = new Date().toISOString();
    const worktree: Worktree = {
      id: randomUUID(),
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

  async deleteWorktreeGroup(worktreeId: string): Promise<void> {
    if (!this.git) throw new Error("Git adapter required for worktree operations");

    const snapshot = this.store.getSnapshot();
    const worktree = snapshot.worktrees.find((w) => w.id === worktreeId);
    if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);
    if (worktree.isDefault) throw new Error("Cannot delete the default worktree");

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

  async listBranches(projectId: string): Promise<string[]> {
    if (!this.git) throw new Error("Git adapter required for worktree operations");

    const snapshot = this.store.getSnapshot();
    const project = snapshot.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    return this.git.branchList(project.repoPath);
  }

  /**
   * Keeps persisted worktree `branch` aligned with `git checkout` performed in that path
   * (or with the branch read from disk after an external HEAD change).
   *
   * @returns whether the persisted worktree row was updated.
   */
  updateWorktreeBranchAtPath(worktreePath: string, branch: string): boolean {
    const normalized = path.normalize(worktreePath);
    const snapshot = this.store.getSnapshot();
    const worktree = snapshot.worktrees.find((w) => path.normalize(w.path) === normalized);
    if (!worktree || worktree.branch === branch) return false;
    const now = new Date().toISOString();
    this.store.upsertWorktree({ ...worktree, branch, updatedAt: now });
    return true;
  }

  async checkWorktreeHealth(worktreeId: string): Promise<{ exists: boolean }> {
    if (!this.git) throw new Error("Git adapter required");
    const snapshot = this.store.getSnapshot();
    const worktree = snapshot.worktrees.find((w) => w.id === worktreeId);
    if (!worktree) return { exists: false };
    const exists = await this.git.pathExists(worktree.path);
    return { exists };
  }

  /**
   * Discovers git worktrees on disk that are not tracked in the DB
   * and imports them as non-default worktree groups.
   */
  async syncWorktrees(projectId: string): Promise<boolean> {
    if (!this.git) return false;

    const snapshot = this.store.getSnapshot();
    const project = snapshot.projects.find((p) => p.id === projectId);
    if (!project) return false;

    const gitWorktrees = await this.git.worktreeList(project.repoPath);
    const knownPaths = new Set(
      snapshot.worktrees
        .filter((w) => w.projectId === projectId)
        .map((w) => w.path)
    );

    let imported = false;
    const now = new Date().toISOString();
    for (const entry of gitWorktrees) {
      // Skip the main worktree (same as repoPath) and already-tracked worktrees
      if (entry.path === project.repoPath || knownPaths.has(entry.path)) continue;

      const worktree: Worktree = {
        id: randomUUID(),
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
