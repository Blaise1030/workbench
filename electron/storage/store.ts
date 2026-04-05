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
    const schemaWithoutThreadSortOrderIndex = schemaSql.replace(
      /^\s*CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_worktree_sort_order ON threads\(worktree_id, sort_order\);\s*$/m,
      ""
    );
    this.db.exec(schemaWithoutThreadSortOrderIndex);
    const hasSortOrder = this.db
      .prepare("SELECT 1 FROM pragma_table_info('threads') WHERE name = 'sort_order' LIMIT 1")
      .get();
    if (!hasSortOrder) {
      this.db.prepare("ALTER TABLE threads ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
    }
    const hasThreadSortOrderIndex = this.db
      .prepare("SELECT 1 FROM pragma_index_list('threads') WHERE name = ? LIMIT 1")
      .get("idx_threads_worktree_sort_order");
    if (!hasThreadSortOrderIndex) {
      this.backfillLegacyThreadSortOrders();
      this.db
        .prepare("CREATE UNIQUE INDEX idx_threads_worktree_sort_order ON threads(worktree_id, sort_order)")
        .run();
    }
    this.db
      .prepare("INSERT OR IGNORE INTO app_state (id, active_project_id, active_worktree_id, active_thread_id) VALUES (1, NULL, NULL, NULL)")
      .run();
  }

  nextThreadSortOrder(worktreeId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sort_order) + 1, 0) AS nextSortOrder FROM threads WHERE worktree_id = ?")
      .get(worktreeId) as { nextSortOrder: number } | undefined;
    return row?.nextSortOrder ?? 0;
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
    const sortOrder = thread.sortOrder ?? 0;
    this.db
      .prepare(
        `INSERT INTO threads (id, project_id, worktree_id, title, agent, sort_order, created_at, updated_at)
         VALUES (@id, @projectId, @worktreeId, @title, @agent, @sortOrder, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           project_id=excluded.project_id,
           worktree_id=excluded.worktree_id,
           title=excluded.title,
           agent=excluded.agent,
           sort_order=excluded.sort_order,
           updated_at=excluded.updated_at`
      )
      .run({ ...thread, sortOrder });
  }

  reorderThreads(worktreeId: string, orderedThreadIds: string[]): void {
    const threadRows = this.db
      .prepare("SELECT id FROM threads WHERE worktree_id = ? ORDER BY id ASC")
      .all(worktreeId) as Array<{ id: string }>;
    const existingThreadIds = threadRows.map((row) => row.id);
    const existingThreadIdSet = new Set(existingThreadIds);
    const orderedThreadIdSet = new Set(orderedThreadIds);
    const duplicateCount = orderedThreadIds.length - orderedThreadIdSet.size;
    const missingThreadIds = existingThreadIds.filter((threadId) => !orderedThreadIdSet.has(threadId));
    const unexpectedThreadIds = orderedThreadIds.filter((threadId) => !existingThreadIdSet.has(threadId));
    if (duplicateCount > 0 || missingThreadIds.length > 0 || unexpectedThreadIds.length > 0) {
      throw new Error(
        `orderedThreadIds must be a full permutation of the worktree's thread ids; missing=[${missingThreadIds.join(", ")}] unexpected=[${unexpectedThreadIds.join(", ")}] duplicates=${duplicateCount}`
      );
    }

    const getMaxSortOrder = this.db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS maxVal FROM threads WHERE worktree_id = ?");
    const shiftSortOrder = this.db.prepare("UPDATE threads SET sort_order = sort_order + ? WHERE worktree_id = ?");
    const updateSortOrder = this.db.prepare("UPDATE threads SET sort_order = ? WHERE worktree_id = ? AND id = ?");
    const reorder = this.db.transaction((targetWorktreeId: string, threadIds: string[]) => {
      const row = getMaxSortOrder.get(targetWorktreeId) as { maxVal: number };
      shiftSortOrder.run(row.maxVal + 1, targetWorktreeId);
      threadIds.forEach((threadId, index) => {
        updateSortOrder.run(index, targetWorktreeId, threadId);
      });
    });
    reorder(worktreeId, orderedThreadIds);
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

  getThread(id: string): Thread | null {
    return (
      (this.db
        .prepare(
          "SELECT id, project_id AS projectId, worktree_id AS worktreeId, title, agent, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM threads WHERE id = ?"
        )
        .get(id) as Thread | undefined) ?? null
    );
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
        "SELECT id, project_id AS projectId, worktree_id AS worktreeId, title, agent, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM threads ORDER BY worktree_id ASC, sort_order ASC, created_at ASC, id ASC"
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

  private backfillLegacyThreadSortOrders(): void {
    const rows = this.db
      .prepare("SELECT id, worktree_id AS worktreeId FROM threads ORDER BY worktree_id ASC, sort_order ASC, created_at ASC, id ASC")
      .all() as Array<{ id: string; worktreeId: string }>;
    const updateThreadSortOrder = this.db.prepare("UPDATE threads SET sort_order = ? WHERE id = ?");
    const assignSortOrders = this.db.transaction((threadRows: Array<{ id: string; worktreeId: string }>) => {
      let activeWorktreeId: string | null = null;
      let nextSortOrder = 0;
      for (const row of threadRows) {
        if (row.worktreeId !== activeWorktreeId) {
          activeWorktreeId = row.worktreeId;
          nextSortOrder = 0;
        }
        updateThreadSortOrder.run(nextSortOrder, row.id);
        nextSortOrder += 1;
      }
    });
    assignSortOrders(rows);
  }
}
