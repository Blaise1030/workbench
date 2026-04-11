import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Project, Thread, ThreadSession, Worktree } from "../../src/shared/domain.js";
import type { WorkspaceSnapshot } from "../../src/shared/ipc.js";

const DEFAULT_DB_FILE = "workspace.db";
type DatabaseInstance = import("better-sqlite3").Database;

type ThreadTableRow = {
  id: string;
  projectId: string;
  worktreeId: string;
  title: string;
  agent: Thread["agent"];
  createdBranch: string | null;
  createdAt: string;
  updatedAt: string;
};

export class WorkspaceStore {
  private db: DatabaseInstance;

  constructor(baseDir: string, filename = DEFAULT_DB_FILE) {
    fs.mkdirSync(baseDir, { recursive: true });
    const dbPath = path.join(baseDir, filename);
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  migrate(schemaSql: string): void {
    const schemaWithoutLegacyThreadSortIndex = schemaSql.replace(
      /^\s*CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_worktree_sort_order ON threads\(worktree_id, sort_order\)(?:\s+WHERE\s+sort_order\s+IS\s+NOT\s+NULL)?;\s*$/m,
      ""
    );
    this.db.exec(schemaWithoutLegacyThreadSortIndex);
    const hasLastActiveWorktreeId = this.db
      .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name = 'last_active_worktree_id' LIMIT 1")
      .get();
    if (!hasLastActiveWorktreeId) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN last_active_worktree_id TEXT").run();
    }
    const hasTabOrder = this.db
      .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name = 'tab_order' LIMIT 1")
      .get();
    if (!hasTabOrder) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN tab_order INTEGER NOT NULL DEFAULT 0").run();
      const legacyOrder = this.db
        .prepare("SELECT id FROM projects ORDER BY updated_at DESC, id ASC")
        .all() as Array<{ id: string }>;
      for (let i = 0; i < legacyOrder.length; i++) {
        this.db.prepare("UPDATE projects SET tab_order = ? WHERE id = ?").run(i, legacyOrder[i].id);
      }
    }
    const hasIsDefault = this.db
      .prepare("SELECT 1 FROM pragma_table_info('worktrees') WHERE name = 'is_default' LIMIT 1")
      .get();
    if (!hasIsDefault) {
      this.db.exec("ALTER TABLE worktrees ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0");
      // Mark all pre-existing worktrees as default (before this feature, each project had one worktree)
      this.db.exec("UPDATE worktrees SET is_default = 1");
    }
    const hasBaseBranch = this.db
      .prepare("SELECT 1 FROM pragma_table_info('worktrees') WHERE name = 'base_branch' LIMIT 1")
      .get();
    if (!hasBaseBranch) {
      this.db.exec("ALTER TABLE worktrees ADD COLUMN base_branch TEXT");
    }
    // Repair: ensure every project has exactly one default worktree
    this.db.exec(`
      UPDATE worktrees SET is_default = 1
      WHERE id IN (
        SELECT MIN(id) FROM worktrees
        WHERE project_id NOT IN (SELECT project_id FROM worktrees WHERE is_default = 1)
        GROUP BY project_id
      )
    `);
    const hasLastActiveThreadId = this.db
      .prepare("SELECT 1 FROM pragma_table_info('worktrees') WHERE name = 'last_active_thread_id' LIMIT 1")
      .get();
    if (!hasLastActiveThreadId) {
      this.db.prepare("ALTER TABLE worktrees ADD COLUMN last_active_thread_id TEXT").run();
    }
    this.migrateThreadsDropSortOrderIfNeeded();
    const hasCreatedBranch = this.db
      .prepare("SELECT 1 FROM pragma_table_info('threads') WHERE name = 'created_branch' LIMIT 1")
      .get();
    if (!hasCreatedBranch) {
      this.db.exec("ALTER TABLE threads ADD COLUMN created_branch TEXT");
    }
    this.db
      .prepare(
        `UPDATE projects
         SET last_active_worktree_id = NULL
         WHERE last_active_worktree_id IS NOT NULL
           AND last_active_worktree_id NOT IN (SELECT id FROM worktrees)`
      )
      .run();
    this.db
      .prepare(
        `UPDATE worktrees
         SET last_active_thread_id = NULL
         WHERE last_active_thread_id IS NOT NULL
           AND last_active_thread_id NOT IN (SELECT id FROM threads)`
      )
      .run();
    this.db
      .prepare(
        `DELETE FROM thread_sessions
         WHERE thread_id NOT IN (SELECT id FROM threads)`
      )
      .run();
    this.db
      .prepare(
        `UPDATE app_state
         SET active_worktree_id = CASE
             WHEN active_worktree_id IS NOT NULL
              AND active_worktree_id NOT IN (SELECT id FROM worktrees)
             THEN NULL
             ELSE active_worktree_id
           END,
           active_thread_id = CASE
             WHEN active_thread_id IS NOT NULL
              AND active_thread_id NOT IN (SELECT id FROM threads)
             THEN NULL
             ELSE active_thread_id
           END
         WHERE id = 1`
      )
      .run();
    this.db
      .prepare("INSERT OR IGNORE INTO app_state (id, active_project_id, active_worktree_id, active_thread_id) VALUES (1, NULL, NULL, NULL)")
      .run();
  }

  upsertProject(project: Project): void {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, repo_path, status, last_active_worktree_id, tab_order, created_at, updated_at)
         VALUES (@id, @name, @repoPath, @status, @lastActiveWorktreeId, @tabOrder, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           repo_path=excluded.repo_path,
           status=excluded.status,
           last_active_worktree_id=excluded.last_active_worktree_id,
           tab_order=excluded.tab_order,
           updated_at=excluded.updated_at`
      )
      .run({ ...project, lastActiveWorktreeId: project.lastActiveWorktreeId ?? null });
  }

  /** Next tab order for a new project (left of existing tabs, matching prior MRU-first ordering). */
  nextProjectTabOrder(): number {
    const row = this.db.prepare("SELECT MIN(tab_order) AS m FROM projects").get() as { m: number | null } | undefined;
    const min = row?.m;
    return min == null ? 0 : min - 1;
  }

  reorderProjects(orderedProjectIds: string[]): void {
    const existing = this.db.prepare("SELECT id FROM projects").all() as Array<{ id: string }>;
    const idSet = new Set(existing.map((r) => r.id));
    if (orderedProjectIds.length !== idSet.size) {
      throw new Error("reorderProjects: ordered list must include each project exactly once");
    }
    for (const id of orderedProjectIds) {
      if (!idSet.has(id)) {
        throw new Error(`reorderProjects: unknown project id ${id}`);
      }
    }
    const tx = this.db.transaction((ids: string[]) => {
      for (let i = 0; i < ids.length; i++) {
        this.db.prepare("UPDATE projects SET tab_order = ? WHERE id = ?").run(i, ids[i]);
      }
    });
    tx(orderedProjectIds);
  }

  deleteProject(projectId: string): void {
    const tx = this.db.transaction((targetProjectId: string) => {
      const remainingProjects = this.db
        .prepare(
          `SELECT id
           FROM projects
           WHERE id != ?
           ORDER BY tab_order ASC, id ASC`
        )
        .all(targetProjectId) as Array<{ id: string }>;
      const nextProjectId = remainingProjects[0]?.id ?? null;
      const nextWorktreeId = nextProjectId
        ? (
            this.db
              .prepare(
                `SELECT id
                 FROM worktrees
                 WHERE project_id = ?
                 ORDER BY is_default DESC, updated_at DESC, id ASC
                 LIMIT 1`
              )
              .get(nextProjectId) as { id: string } | undefined
          )?.id ?? null
        : null;
      const nextThreadId = nextWorktreeId
        ? (
            (
              this.db
                .prepare(
                  `SELECT id FROM threads WHERE worktree_id = ? ORDER BY created_at DESC, id ASC LIMIT 1`
                )
                .get(nextWorktreeId) as { id: string } | undefined
            )?.id ?? null
          )
        : null;

      this.db
        .prepare("UPDATE projects SET last_active_worktree_id = NULL WHERE last_active_worktree_id IN (SELECT id FROM worktrees WHERE project_id = ?)")
        .run(targetProjectId);
      this.db
        .prepare("UPDATE app_state SET active_project_id = ?, active_worktree_id = ?, active_thread_id = ? WHERE id = 1")
        .run(nextProjectId, nextWorktreeId, nextThreadId);
      this.db
        .prepare(
          `DELETE FROM run_events
           WHERE run_id IN (
             SELECT r.id
             FROM runs r
             INNER JOIN threads t ON t.id = r.thread_id
             WHERE t.project_id = ?
           )`
        )
        .run(targetProjectId);
      this.db
        .prepare(
          `DELETE FROM runs
           WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ?)`
        )
        .run(targetProjectId);
      this.db
        .prepare("DELETE FROM thread_sessions WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ?)")
        .run(targetProjectId);
      this.db.prepare("DELETE FROM threads WHERE project_id = ?").run(targetProjectId);
      this.db.prepare("DELETE FROM worktrees WHERE project_id = ?").run(targetProjectId);
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(targetProjectId);
    });
    tx(projectId);
  }

  upsertWorktree(worktree: Worktree): void {
    this.db
      .prepare(
        `INSERT INTO worktrees (id, project_id, name, branch, path, is_active, is_default, base_branch, last_active_thread_id, created_at, updated_at)
         VALUES (@id, @projectId, @name, @branch, @path, @isActive, @isDefault, @baseBranch, @lastActiveThreadId, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           project_id=excluded.project_id,
           name=excluded.name,
           branch=excluded.branch,
           path=excluded.path,
           is_active=excluded.is_active,
           is_default=excluded.is_default,
           base_branch=excluded.base_branch,
           last_active_thread_id=excluded.last_active_thread_id,
           updated_at=excluded.updated_at`
      )
      .run({ ...worktree, isActive: worktree.isActive ? 1 : 0, isDefault: worktree.isDefault ? 1 : 0, baseBranch: worktree.baseBranch ?? null, lastActiveThreadId: worktree.lastActiveThreadId ?? null });
  }

  upsertThread(thread: Thread): void {
    this.db
      .prepare(
        `INSERT INTO threads (id, project_id, worktree_id, title, agent, created_branch, created_at, updated_at)
         VALUES (@id, @projectId, @worktreeId, @title, @agent, @createdBranch, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           project_id=excluded.project_id,
           worktree_id=excluded.worktree_id,
           title=excluded.title,
           agent=excluded.agent,
           created_branch=excluded.created_branch,
           updated_at=excluded.updated_at`
      )
      .run({
        id: thread.id,
        projectId: thread.projectId,
        worktreeId: thread.worktreeId,
        title: thread.title,
        agent: thread.agent,
        createdBranch: thread.createdBranch ?? null,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      });
  }

  upsertThreadSession(threadSession: ThreadSession): void {
    const thread = this.getThread(threadSession.threadId);
    if (!thread) {
      throw new Error(`Cannot persist thread session for missing thread ${threadSession.threadId}`);
    }
    if (thread.agent !== threadSession.provider) {
      throw new Error(
        `Thread session provider ${threadSession.provider} must match thread agent ${thread.agent} for ${threadSession.threadId}`
      );
    }
    this.db
      .prepare(
        `INSERT INTO thread_sessions (
           thread_id, provider, resume_id, initial_prompt, title_captured_at, launch_mode,
           status, last_activity_at, metadata_json, created_at, updated_at
         ) VALUES (
           @threadId, @provider, @resumeId, @initialPrompt, @titleCapturedAt, @launchMode,
           @status, @lastActivityAt, @metadataJson, @createdAt, @updatedAt
         )
         ON CONFLICT(thread_id) DO UPDATE SET
           provider=excluded.provider,
           resume_id=excluded.resume_id,
           initial_prompt=excluded.initial_prompt,
           title_captured_at=excluded.title_captured_at,
           launch_mode=excluded.launch_mode,
           status=excluded.status,
           last_activity_at=excluded.last_activity_at,
           metadata_json=excluded.metadata_json,
           updated_at=excluded.updated_at`
      )
      .run({
        ...threadSession,
        resumeId: threadSession.resumeId ?? null,
        initialPrompt: threadSession.initialPrompt ?? null,
        titleCapturedAt: threadSession.titleCapturedAt ?? null,
        metadataJson: threadSession.metadataJson ?? null
      });
  }

  deleteThreadSession(threadId: string): void {
    this.db.prepare("DELETE FROM thread_sessions WHERE thread_id = ?").run(threadId);
  }

  getThreadSession(threadId: string): ThreadSession | null {
    return (
      (this.db
        .prepare(
          `SELECT
             thread_id AS threadId,
             provider,
             resume_id AS resumeId,
             initial_prompt AS initialPrompt,
             title_captured_at AS titleCapturedAt,
             launch_mode AS launchMode,
             status,
             last_activity_at AS lastActivityAt,
             metadata_json AS metadataJson,
             created_at AS createdAt,
             updated_at AS updatedAt
           FROM thread_sessions
           WHERE thread_id = ?`
        )
        .get(threadId) as ThreadSession | undefined) ?? null
    );
  }

  listThreadSessions(): ThreadSession[] {
    return this.db
      .prepare(
        `SELECT
           thread_id AS threadId,
           provider,
           resume_id AS resumeId,
           initial_prompt AS initialPrompt,
           title_captured_at AS titleCapturedAt,
           launch_mode AS launchMode,
           status,
           last_activity_at AS lastActivityAt,
           metadata_json AS metadataJson,
           created_at AS createdAt,
           updated_at AS updatedAt
         FROM thread_sessions
         ORDER BY updated_at DESC, thread_id ASC`
      )
      .all() as ThreadSession[];
  }

  deleteWorktreeGroup(worktreeId: string): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare("UPDATE projects SET last_active_worktree_id = NULL WHERE last_active_worktree_id = ?")
        .run(worktreeId);
      this.db
        .prepare("UPDATE app_state SET active_worktree_id = NULL WHERE active_worktree_id = ?")
        .run(worktreeId);
      this.db
        .prepare(
          `UPDATE app_state
           SET active_thread_id = NULL
           WHERE active_thread_id IN (SELECT id FROM threads WHERE worktree_id = ?)`
        )
        .run(worktreeId);
      this.db
        .prepare(
          `DELETE FROM run_events
           WHERE run_id IN (
             SELECT r.id
             FROM runs r
             INNER JOIN threads t ON t.id = r.thread_id
             WHERE t.worktree_id = ?
           )`
        )
        .run(worktreeId);
      this.db
        .prepare(
          `DELETE FROM runs
           WHERE thread_id IN (SELECT id FROM threads WHERE worktree_id = ?)`
        )
        .run(worktreeId);
      this.db
        .prepare("DELETE FROM thread_sessions WHERE thread_id IN (SELECT id FROM threads WHERE worktree_id = ?)")
        .run(worktreeId);
      this.db.prepare("DELETE FROM threads WHERE worktree_id = ?").run(worktreeId);
      this.db.prepare("DELETE FROM worktrees WHERE id = ?").run(worktreeId);
    });
    tx();
  }

  deleteThread(id: string): void {
    this.db.prepare("DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE thread_id = ?)").run(id);
    this.db.prepare("DELETE FROM runs WHERE thread_id = ?").run(id);
    this.deleteThreadSession(id);
    this.db.prepare("DELETE FROM threads WHERE id = ?").run(id);
    this.db.prepare("UPDATE worktrees SET last_active_thread_id = NULL WHERE last_active_thread_id = ?").run(id);
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
    const row = this.db
      .prepare(
        "SELECT id, project_id AS projectId, worktree_id AS worktreeId, title, agent, created_branch AS createdBranch, created_at AS createdAt, updated_at AS updatedAt FROM threads WHERE id = ?"
      )
      .get(id) as ThreadTableRow | undefined;
    return row ? WorkspaceStore.rowToThread(row) : null;
  }

  setActiveState(activeProjectId: string | null, activeWorktreeId: string | null, activeThreadId: string | null): void {
    let resolvedWorktreeId = activeWorktreeId;
    let resolvedThreadId = activeThreadId;
    if (activeProjectId && resolvedWorktreeId == null) {
      const rememberedWorktree = this.db
        .prepare(
          `SELECT p.last_active_worktree_id AS worktreeId
           FROM projects p
           WHERE p.id = ?
             AND EXISTS (
               SELECT 1
               FROM worktrees w
               WHERE w.id = p.last_active_worktree_id
                 AND w.project_id = p.id
             )`
        )
        .get(activeProjectId) as { worktreeId: string | null } | undefined;
      resolvedWorktreeId = rememberedWorktree?.worktreeId ?? null;
    }
    if (resolvedWorktreeId) {
      if (resolvedThreadId == null) {
        const remembered = this.db
          .prepare(
            `SELECT w.last_active_thread_id AS threadId
             FROM worktrees w
             WHERE w.id = ?
               AND EXISTS (
                 SELECT 1
                 FROM threads t
                 WHERE t.id = w.last_active_thread_id
                   AND t.worktree_id = w.id
               )`
          )
          .get(resolvedWorktreeId) as { threadId: string | null } | undefined;
        resolvedThreadId = remembered?.threadId ?? null;
      } else {
        const matchesWorktree = this.db
          .prepare("SELECT 1 FROM threads WHERE id = ? AND worktree_id = ? LIMIT 1")
          .get(resolvedThreadId, resolvedWorktreeId);
        if (!matchesWorktree) {
          resolvedThreadId = null;
        } else {
          this.db.prepare("UPDATE worktrees SET last_active_thread_id = ? WHERE id = ?").run(
            resolvedThreadId,
            resolvedWorktreeId
          );
        }
      }
      if (activeProjectId) {
        const matchesProject = this.db
          .prepare("SELECT 1 FROM worktrees WHERE id = ? AND project_id = ? LIMIT 1")
          .get(resolvedWorktreeId, activeProjectId);
        if (matchesProject) {
          this.db.prepare("UPDATE projects SET last_active_worktree_id = ? WHERE id = ?").run(
            resolvedWorktreeId,
            activeProjectId
          );
        } else {
          resolvedWorktreeId = null;
          resolvedThreadId = null;
        }
      }
    } else {
      resolvedThreadId = null;
    }
    this.db
      .prepare("UPDATE app_state SET active_project_id = ?, active_worktree_id = ?, active_thread_id = ? WHERE id = 1")
      .run(activeProjectId, resolvedWorktreeId, resolvedThreadId);
  }

  getSnapshot(): WorkspaceSnapshot {
    const projects = this.db
      .prepare(
        "SELECT id, name, repo_path AS repoPath, status, last_active_worktree_id AS lastActiveWorktreeId, tab_order AS tabOrder, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY tab_order ASC, id ASC"
      )
      .all() as Project[];
    const worktreeRows = this.db
      .prepare(
        "SELECT id, project_id AS projectId, name, branch, path, is_active AS isActive, is_default AS isDefault, base_branch AS baseBranch, last_active_thread_id AS lastActiveThreadId, created_at AS createdAt, updated_at AS updatedAt FROM worktrees ORDER BY updated_at DESC"
      )
      .all() as Array<Omit<Worktree, "isActive" | "isDefault"> & { isActive: number | boolean; isDefault: number | boolean }>;
    const worktrees = worktreeRows.map((w) => ({ ...w, isActive: Boolean(w.isActive), isDefault: Boolean(w.isDefault), baseBranch: w.baseBranch ?? null })) as Worktree[];
    const threadRows = this.db
      .prepare(
        "SELECT id, project_id AS projectId, worktree_id AS worktreeId, title, agent, created_branch AS createdBranch, created_at AS createdAt, updated_at AS updatedAt FROM threads"
      )
      .all() as ThreadTableRow[];
    const threads = threadRows.map((row) => WorkspaceStore.rowToThread(row));
    threads.sort((a, b) => {
      const byWt = a.worktreeId.localeCompare(b.worktreeId);
      if (byWt !== 0) return byWt;
      const byCreated = b.createdAt.localeCompare(a.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
    const threadSessions = this.listThreadSessions();
    const active = this.db
      .prepare("SELECT active_project_id AS activeProjectId, active_worktree_id AS activeWorktreeId, active_thread_id AS activeThreadId FROM app_state WHERE id = 1")
      .get() as { activeProjectId: string | null; activeWorktreeId: string | null; activeThreadId: string | null } | undefined;

    return {
      projects,
      worktrees,
      threads,
      threadSessions,
      activeProjectId: active?.activeProjectId ?? null,
      activeWorktreeId: active?.activeWorktreeId ?? null,
      activeThreadId: active?.activeThreadId ?? null
    };
  }

  /** Legacy DBs: drop `sort_order` column and thread sort index; threads are ordered by `created_at` only. */
  private migrateThreadsDropSortOrderIfNeeded(): void {
    const col = this.db
      .prepare("SELECT 1 FROM pragma_table_info('threads') WHERE name = 'sort_order' LIMIT 1")
      .get();
    if (!col) return;

    this.db.exec("DROP INDEX IF EXISTS idx_threads_worktree_sort_order");
    this.db.exec("PRAGMA foreign_keys = OFF");
    const rebuild = this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE threads__no_sort (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          worktree_id TEXT NOT NULL,
          title TEXT NOT NULL,
          agent TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id),
          FOREIGN KEY(worktree_id) REFERENCES worktrees(id)
        )
      `);
      this.db.exec(`
        INSERT INTO threads__no_sort (id, project_id, worktree_id, title, agent, created_at, updated_at)
        SELECT id, project_id, worktree_id, title, agent, created_at, updated_at FROM threads
      `);
      this.db.exec("DROP TABLE threads");
      this.db.exec("ALTER TABLE threads__no_sort RENAME TO threads");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_threads_worktree_id ON threads(worktree_id)");
    });
    rebuild();
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  private static rowToThread(row: ThreadTableRow): Thread {
    return {
      id: row.id,
      projectId: row.projectId,
      worktreeId: row.worktreeId,
      title: row.title,
      agent: row.agent,
      createdBranch: row.createdBranch ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
