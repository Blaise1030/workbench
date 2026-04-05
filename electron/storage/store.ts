import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Project, Thread, Worktree } from "../../src/shared/domain.js";
import type { WorkspaceSnapshot } from "../../src/shared/ipc.js";

const DEFAULT_DB_FILE = "workspace.db";
type DatabaseInstance = import("better-sqlite3").Database;

export class WorkspaceStore {
  private db: DatabaseInstance;

  constructor(baseDir: string, filename = DEFAULT_DB_FILE) {
    fs.mkdirSync(baseDir, { recursive: true });
    const dbPath = path.join(baseDir, filename);
    this.db = new Database(dbPath);
  }

  migrate(schemaSql: string): void {
    this.db.exec(schemaSql);
    this.db
      .prepare("INSERT OR IGNORE INTO app_state (id, active_project_id, active_worktree_id, active_thread_id) VALUES (1, NULL, NULL, NULL)")
      .run();
  }

  upsertProject(project: Project): void {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, repo_path, status, created_at, updated_at)
         VALUES (@id, @name, @repoPath, @status, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           repo_path=excluded.repo_path,
           status=excluded.status,
           updated_at=excluded.updated_at`
      )
      .run(project);
  }

  upsertWorktree(worktree: Worktree): void {
    this.db
      .prepare(
        `INSERT INTO worktrees (id, project_id, name, branch, path, is_active, created_at, updated_at)
         VALUES (@id, @projectId, @name, @branch, @path, @isActive, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           project_id=excluded.project_id,
           name=excluded.name,
           branch=excluded.branch,
           path=excluded.path,
           is_active=excluded.is_active,
           updated_at=excluded.updated_at`
      )
      .run({ ...worktree, isActive: worktree.isActive ? 1 : 0 });
  }

  upsertThread(thread: Thread): void {
    this.db
      .prepare(
        `INSERT INTO threads (id, project_id, worktree_id, title, agent, created_at, updated_at)
         VALUES (@id, @projectId, @worktreeId, @title, @agent, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           project_id=excluded.project_id,
           worktree_id=excluded.worktree_id,
           title=excluded.title,
           agent=excluded.agent,
           updated_at=excluded.updated_at`
      )
      .run(thread);
  }

  deleteThread(id: string): void {
    this.db.prepare("DELETE FROM threads WHERE id = ?").run(id);
    this.db
      .prepare(
        `UPDATE app_state
         SET active_thread_id = CASE WHEN active_thread_id = ? THEN NULL ELSE active_thread_id END
         WHERE id = 1`
      )
      .run(id);
  }

  renameThread(id: string, title: string): void {
    const updatedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, updatedAt, id);
  }

  setActiveState(activeProjectId: string | null, activeWorktreeId: string | null, activeThreadId: string | null): void {
    this.db
      .prepare("UPDATE app_state SET active_project_id = ?, active_worktree_id = ?, active_thread_id = ? WHERE id = 1")
      .run(activeProjectId, activeWorktreeId, activeThreadId);
  }

  getSnapshot(): WorkspaceSnapshot {
    const projects = this.db
      .prepare("SELECT id, name, repo_path AS repoPath, status, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC")
      .all() as Project[];
    const worktreeRows = this.db
      .prepare(
        "SELECT id, project_id AS projectId, name, branch, path, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM worktrees ORDER BY updated_at DESC"
      )
      .all() as Array<Omit<Worktree, "isActive"> & { isActive: number | boolean }>;
    const worktrees = worktreeRows.map((w) => ({ ...w, isActive: Boolean(w.isActive) })) as Worktree[];
    const threads = this.db
      .prepare(
        "SELECT id, project_id AS projectId, worktree_id AS worktreeId, title, agent, created_at AS createdAt, updated_at AS updatedAt FROM threads ORDER BY updated_at DESC"
      )
      .all() as Thread[];
    const active = this.db
      .prepare("SELECT active_project_id AS activeProjectId, active_worktree_id AS activeWorktreeId, active_thread_id AS activeThreadId FROM app_state WHERE id = 1")
      .get() as { activeProjectId: string | null; activeWorktreeId: string | null; activeThreadId: string | null } | undefined;

    return {
      projects,
      worktrees,
      threads,
      activeProjectId: active?.activeProjectId ?? null,
      activeWorktreeId: active?.activeWorktreeId ?? null,
      activeThreadId: active?.activeThreadId ?? null
    };
  }
}
