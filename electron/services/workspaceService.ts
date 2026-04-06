import { randomUUID } from "node:crypto";
import type { Project, Thread, Worktree } from "../../src/shared/domain.js";
import type { CreateThreadInput, WorkspaceSnapshot } from "../../src/shared/ipc.js";
import { WorkspaceStore } from "../storage/store.js";

const DEFAULT_THREAD_TITLES: Record<Thread["agent"], string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};
const MAX_DERIVED_TITLE_LENGTH = 68;

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
  constructor(private store: WorkspaceStore) {}

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
      createdAt: now,
      updatedAt: now
    };
    this.store.upsertProject(project);
    this.store.setActiveState(project.id, null, null);
    return project;
  }

  addWorktree(projectId: string, branch: string, worktreePath: string): Worktree {
    const now = new Date().toISOString();
    const worktree: Worktree = {
      id: randomUUID(),
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

  createThread(input: CreateThreadInput): Thread {
    const now = new Date().toISOString();
    const thread: Thread = {
      id: randomUUID(),
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

  deleteThread(threadId: string): void {
    this.store.deleteThread(threadId);
  }

  renameThread(threadId: string, title: string): void {
    this.store.renameThread(threadId, title);
  }

  maybeRenameThreadFromPrompt(threadId: string, input: string): boolean {
    const nextTitle = deriveThreadTitleFromPrompt(input);
    if (!nextTitle) return false;

    const thread = this.store.getThread(threadId);
    if (!thread) return false;
    if (thread.createdAt !== thread.updatedAt) return false;
    if (!hasDefaultGeneratedTitle(thread)) return false;
    if (thread.title === nextTitle) return false;

    this.store.renameThread(threadId, nextTitle);
    return true;
  }

  setActive(projectId: string | null, worktreeId: string | null, threadId: string | null): void {
    this.store.setActiveState(projectId, worktreeId, threadId);
  }

  reorderThreads(worktreeId: string, orderedThreadIds: string[]): void {
    this.store.reorderThreads(worktreeId, orderedThreadIds);
  }
}
