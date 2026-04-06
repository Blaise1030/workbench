"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
vitest_1.vi.mock("better-sqlite3", async () => {
    const module = await Promise.resolve().then(() => __importStar(require("./betterSqlite3Compat")));
    return { default: module.default };
});
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const store_1 = require("../store");
const CURRENT_SCHEMA_PATH = node_path_1.default.resolve(__dirname, "..", "schema.sql");
const LEGACY_THREADS_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  status TEXT NOT NULL,
  last_active_worktree_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  last_active_thread_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worktree_id TEXT NOT NULL,
  title TEXT NOT NULL,
  agent TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(worktree_id) REFERENCES worktrees(id)
);

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_project_id TEXT,
  active_worktree_id TEXT,
  active_thread_id TEXT
);
`;
const LEGACY_THREADS_WITH_SORT_ORDER_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  status TEXT NOT NULL,
  last_active_worktree_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  last_active_thread_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worktree_id TEXT NOT NULL,
  title TEXT NOT NULL,
  agent TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(worktree_id) REFERENCES worktrees(id)
);

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_project_id TEXT,
  active_worktree_id TEXT,
  active_thread_id TEXT
);
`;
const NEW_SCHEMA = node_fs_1.default.readFileSync(CURRENT_SCHEMA_PATH, "utf8");
function makeTempDir() {
    return node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "instrument-store-"));
}
function makeProject(overrides = {}) {
    return {
        id: "project-1",
        name: "instrument",
        repoPath: "/tmp/instrument",
        status: "idle",
        lastActiveWorktreeId: null,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z",
        ...overrides
    };
}
function makeWorktree(overrides = {}) {
    return {
        id: "worktree-1",
        projectId: "project-1",
        name: "main",
        branch: "main",
        path: "/tmp/instrument",
        isActive: true,
        lastActiveThreadId: null,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z",
        ...overrides
    };
}
function makeThread(overrides = {}) {
    return {
        id: "thread-1",
        projectId: "project-1",
        worktreeId: "worktree-1",
        title: "Codex CLI",
        agent: "codex",
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z",
        sortOrder: 0,
        ...overrides
    };
}
function seedBasicWorkspace(store) {
    store.upsertProject(makeProject());
    store.upsertWorktree(makeWorktree());
}
function createLegacyDatabase(dbPath) {
    const db = new better_sqlite3_1.default(dbPath);
    db.exec(LEGACY_THREADS_SCHEMA);
    db.prepare("INSERT INTO app_state (id, active_project_id, active_worktree_id, active_thread_id) VALUES (1, NULL, NULL, NULL)").run();
    db.close();
}
(0, vitest_1.describe)("WorkspaceStore", () => {
    (0, vitest_1.afterEach)(() => {
        // Temp directories are created per test case and cleaned up eagerly.
    });
    (0, vitest_1.it)("returns threads ordered by sortOrder within a worktree", () => {
        const baseDir = makeTempDir();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        seedBasicWorkspace(store);
        store.upsertThread(makeThread({
            id: "thread-1",
            title: "First inserted last",
            sortOrder: 2,
            updatedAt: "2026-04-06T00:03:00.000Z"
        }));
        store.upsertThread(makeThread({
            id: "thread-2",
            title: "First in sidebar",
            sortOrder: 0,
            updatedAt: "2026-04-06T00:05:00.000Z"
        }));
        store.upsertThread(makeThread({
            id: "thread-3",
            title: "Second in sidebar",
            sortOrder: 1,
            updatedAt: "2026-04-06T00:01:00.000Z"
        }));
        (0, vitest_1.expect)(store.getSnapshot().threads.map((thread) => thread.id)).toEqual([
            "thread-2",
            "thread-3",
            "thread-1"
        ]);
    });
    (0, vitest_1.it)("reorders threads for a worktree and persists the new sortOrder", () => {
        const baseDir = makeTempDir();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        seedBasicWorkspace(store);
        store.upsertThread(makeThread({ id: "thread-1", sortOrder: 0 }));
        store.upsertThread(makeThread({ id: "thread-2", sortOrder: 1 }));
        store.upsertThread(makeThread({ id: "thread-3", sortOrder: 2 }));
        store.reorderThreads("worktree-1", ["thread-3", "thread-1", "thread-2"]);
        const reopenedStore = new store_1.WorkspaceStore(baseDir);
        reopenedStore.migrate(NEW_SCHEMA);
        (0, vitest_1.expect)(reopenedStore.getSnapshot().threads.map((thread) => `${thread.id}:${thread.sortOrder}`)).toEqual([
            "thread-3:0",
            "thread-1:1",
            "thread-2:2"
        ]);
    });
    (0, vitest_1.it)("rejects reorder payloads that are not a full permutation of the worktree threads", () => {
        const baseDir = makeTempDir();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        seedBasicWorkspace(store);
        store.upsertThread(makeThread({ id: "thread-1", sortOrder: 0 }));
        store.upsertThread(makeThread({ id: "thread-2", sortOrder: 1 }));
        store.upsertThread(makeThread({ id: "thread-3", sortOrder: 2 }));
        const reorder = store;
        const before = store.getSnapshot().threads.map((thread) => `${thread.id}:${thread.sortOrder}`);
        (0, vitest_1.expect)(() => reorder.reorderThreads("worktree-1", ["thread-1", "thread-2"])).toThrow(/full permutation/i);
        (0, vitest_1.expect)(() => reorder.reorderThreads("worktree-1", ["thread-1", "thread-1", "thread-2"])).toThrow(/full permutation/i);
        (0, vitest_1.expect)(() => reorder.reorderThreads("worktree-1", ["thread-1", "thread-2", "thread-999"])).toThrow(/full permutation/i);
        (0, vitest_1.expect)(store.getSnapshot().threads.map((thread) => `${thread.id}:${thread.sortOrder}`)).toEqual(before);
    });
    (0, vitest_1.it)("restores the last selected thread when switching back to a worktree", () => {
        const baseDir = makeTempDir();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        store.upsertProject(makeProject());
        store.upsertWorktree(makeWorktree({ id: "worktree-1", name: "main", branch: "main" }));
        store.upsertWorktree(makeWorktree({ id: "worktree-2", name: "feature", branch: "feature" }));
        store.upsertThread(makeThread({ id: "thread-1", worktreeId: "worktree-1" }));
        store.upsertThread(makeThread({ id: "thread-2", worktreeId: "worktree-2" }));
        store.setActiveState("project-1", "worktree-1", "thread-1");
        store.setActiveState("project-1", "worktree-2", "thread-2");
        store.setActiveState("project-1", "worktree-1", null);
        const snapshot = store.getSnapshot();
        (0, vitest_1.expect)(snapshot.activeWorktreeId).toBe("worktree-1");
        (0, vitest_1.expect)(snapshot.activeThreadId).toBe("thread-1");
    });
    (0, vitest_1.it)("restores the last selected worktree and thread when switching back to a project", () => {
        const baseDir = makeTempDir();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        store.upsertProject(makeProject({ id: "project-1" }));
        store.upsertProject(makeProject({ id: "project-2", repoPath: "/tmp/other", name: "other" }));
        store.upsertWorktree(makeWorktree({ id: "worktree-1", projectId: "project-1", branch: "main", name: "main" }));
        store.upsertWorktree(makeWorktree({ id: "worktree-2", projectId: "project-2", branch: "feature", name: "feature" }));
        store.upsertThread(makeThread({ id: "thread-1", projectId: "project-1", worktreeId: "worktree-1" }));
        store.upsertThread(makeThread({ id: "thread-2", projectId: "project-2", worktreeId: "worktree-2" }));
        store.setActiveState("project-1", "worktree-1", "thread-1");
        store.setActiveState("project-2", "worktree-2", "thread-2");
        store.setActiveState("project-1", null, null);
        const snapshot = store.getSnapshot();
        (0, vitest_1.expect)(snapshot.activeProjectId).toBe("project-1");
        (0, vitest_1.expect)(snapshot.activeWorktreeId).toBe("worktree-1");
        (0, vitest_1.expect)(snapshot.activeThreadId).toBe("thread-1");
    });
    (0, vitest_1.it)("clears remembered worktree selection when the remembered thread is deleted", () => {
        const baseDir = makeTempDir();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        seedBasicWorkspace(store);
        store.upsertThread(makeThread({ id: "thread-1" }));
        store.setActiveState("project-1", "worktree-1", "thread-1");
        store.deleteThread("thread-1");
        store.setActiveState("project-1", "worktree-1", null);
        const snapshot = store.getSnapshot();
        (0, vitest_1.expect)(snapshot.activeThreadId).toBeNull();
        (0, vitest_1.expect)(snapshot.worktrees.find((worktree) => worktree.id === "worktree-1")?.lastActiveThreadId).toBeNull();
    });
    (0, vitest_1.it)("assigns deterministic sortOrder values for legacy rows during migration", () => {
        const baseDir = makeTempDir();
        const dbPath = node_path_1.default.join(baseDir, "workspace.db");
        createLegacyDatabase(dbPath);
        const legacyDb = new better_sqlite3_1.default(dbPath);
        legacyDb.prepare("INSERT INTO projects (id, name, repo_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("project-1", "instrument", "/tmp/instrument", "idle", "2026-04-06T00:00:00.000Z", "2026-04-06T00:00:00.000Z");
        legacyDb.prepare("INSERT INTO worktrees (id, project_id, name, branch, path, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("worktree-1", "project-1", "main", "main", "/tmp/instrument", 1, "2026-04-06T00:00:00.000Z", "2026-04-06T00:00:00.000Z");
        legacyDb.prepare("INSERT INTO threads (id, project_id, worktree_id, title, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("thread-b", "project-1", "worktree-1", "Later", "codex", "2026-04-06T00:03:00.000Z", "2026-04-06T00:03:00.000Z");
        legacyDb.prepare("INSERT INTO threads (id, project_id, worktree_id, title, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("thread-a", "project-1", "worktree-1", "Earlier", "codex", "2026-04-06T00:01:00.000Z", "2026-04-06T00:01:00.000Z");
        legacyDb.prepare("INSERT INTO threads (id, project_id, worktree_id, title, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("thread-c", "project-1", "worktree-1", "Tie breaker", "codex", "2026-04-06T00:01:00.000Z", "2026-04-06T00:01:00.000Z");
        legacyDb.close();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        (0, vitest_1.expect)(store.getSnapshot().threads.map((thread) => `${thread.id}:${thread.sortOrder}`)).toEqual([
            "thread-a:0",
            "thread-c:1",
            "thread-b:2"
        ]);
    });
    (0, vitest_1.it)("normalizes legacy duplicate sort orders and creates a unique worktree sort index during migration", () => {
        const baseDir = makeTempDir();
        const dbPath = node_path_1.default.join(baseDir, "workspace.db");
        const legacyDb = new better_sqlite3_1.default(dbPath);
        legacyDb.exec(LEGACY_THREADS_WITH_SORT_ORDER_SCHEMA);
        legacyDb.prepare("INSERT INTO app_state (id, active_project_id, active_worktree_id, active_thread_id) VALUES (1, NULL, NULL, NULL)").run();
        legacyDb.prepare("INSERT INTO projects (id, name, repo_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("project-1", "instrument", "/tmp/instrument", "idle", "2026-04-06T00:00:00.000Z", "2026-04-06T00:00:00.000Z");
        legacyDb.prepare("INSERT INTO worktrees (id, project_id, name, branch, path, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("worktree-1", "project-1", "main", "main", "/tmp/instrument", 1, "2026-04-06T00:00:00.000Z", "2026-04-06T00:00:00.000Z");
        legacyDb.prepare("INSERT INTO threads (id, project_id, worktree_id, title, agent, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("thread-a", "project-1", "worktree-1", "Earlier", "codex", 0, "2026-04-06T00:01:00.000Z", "2026-04-06T00:01:00.000Z");
        legacyDb.prepare("INSERT INTO threads (id, project_id, worktree_id, title, agent, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("thread-b", "project-1", "worktree-1", "Later duplicate", "codex", 0, "2026-04-06T00:02:00.000Z", "2026-04-06T00:02:00.000Z");
        legacyDb.prepare("INSERT INTO threads (id, project_id, worktree_id, title, agent, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("thread-c", "project-1", "worktree-1", "Latest", "codex", 2, "2026-04-06T00:03:00.000Z", "2026-04-06T00:03:00.000Z");
        legacyDb.close();
        const store = new store_1.WorkspaceStore(baseDir);
        store.migrate(NEW_SCHEMA);
        (0, vitest_1.expect)(store.getSnapshot().threads.map((thread) => `${thread.id}:${thread.sortOrder}`)).toEqual([
            "thread-a:0",
            "thread-b:1",
            "thread-c:2"
        ]);
        const uniqueIndex = storeDbIndexInfo(store, "idx_threads_worktree_sort_order");
        (0, vitest_1.expect)(uniqueIndex?.isUnique).toBe(1);
    });
});
function storeDbIndexInfo(store, indexName) {
    const db = store.db;
    if (!db)
        return undefined;
    return db.prepare("SELECT name, [unique] AS isUnique FROM pragma_index_list('threads') WHERE name = ?").get(indexName);
}
