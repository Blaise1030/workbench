import { randomUUID } from "node:crypto";
import type { Project, Thread, Worktree } from "../../src/shared/domain.js";
import type { CreateThreadInput, WorkspaceSnapshot } from "../../src/shared/ipc.js";
import { WorkspaceStore } from "../storage/store.js";

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

  setActive(projectId: string | null, worktreeId: string | null, threadId: string | null): void {
    this.store.setActiveState(projectId, worktreeId, threadId);
  }
}
