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

CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_worktree_sort_order ON threads(worktree_id, sort_order);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(thread_id) REFERENCES threads(id)
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_project_id TEXT,
  active_worktree_id TEXT,
  active_thread_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_worktrees_project_id ON worktrees(project_id);
CREATE INDEX IF NOT EXISTS idx_threads_worktree_id ON threads(worktree_id);
CREATE INDEX IF NOT EXISTS idx_runs_thread_id ON runs(thread_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_events_run_id ON run_events(run_id);
