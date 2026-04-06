# Thread Groups (Worktree-Backed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add worktree-backed thread groups so users can create isolated workspaces with their own branch, terminals, and file context.

**Architecture:** Extend the existing `Worktree` entity with `isDefault` and `baseBranch` fields. The default worktree (created when a project is added) holds ungrouped threads. New worktrees are created via `git worktree add` and displayed as collapsible groups in the thread sidebar. Context switching (agent, diff, files, terminals) already works per-worktree — the main work is UI for group management and the git worktree lifecycle.

**Tech Stack:** Vue 3, Pinia, Electron IPC, better-sqlite3, simple-git, xterm.js, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/domain.ts` | Modify | Add `isDefault`, `baseBranch` to `Worktree` |
| `src/shared/ipc.ts` | Modify | Add new IPC channels and `CreateWorktreeGroupInput` type |
| `electron/storage/schema.sql` | Modify | Add `is_default`, `base_branch` columns to worktrees |
| `electron/storage/store.ts` | Modify | Add `deleteWorktreeGroup`, `getWorktreesByProject` methods |
| `electron/storage/__tests__/store.test.ts` | Modify | Tests for new store methods |
| `electron/services/workspaceService.ts` | Modify | Add `createWorktreeGroup`, `deleteWorktreeGroup`, `listBranches`, `discoverExternalWorktrees`, `checkWorktreeHealth` |
| `electron/services/__tests__/workspaceService.test.ts` | Modify | Tests for new service methods |
| `electron/mainApp.ts` | Modify | Register new IPC handlers |
| `electron/preload.ts` | Modify | Expose new API methods to renderer |
| `src/stores/workspaceStore.ts` | Modify | Add getters: `defaultWorktree`, `threadGroups`, `ungroupedThreads`, `groupedThreadsByWorktree` |
| `src/components/ThreadGroupHeader.vue` | Create | Collapsible group header with branch badge |
| `src/components/BranchPicker.vue` | Create | Inline branch selector for creating thread groups |
| `src/components/WorktreeStaleCallout.vue` | Create | Warning callout for missing worktrees |
| `src/components/ThreadCreateButton.vue` | Modify | Add "New Thread Group" to agent menu |
| `src/components/ThreadSidebar.vue` | Modify | Render grouped/ungrouped sections |
| `src/components/ThreadTopBar.vue` | Modify | Wire new `createWorktreeGroup` event |
| `src/layouts/WorkspaceLayout.vue` | Modify | Wire new IPC calls, pass worktree data to sidebar |
| `src/components/__tests__/ThreadSidebar.test.ts` | Modify | Tests for grouped layout |

---

### Task 1: Schema and Domain Types

**Files:**
- Modify: `electron/storage/schema.sql`
- Modify: `src/shared/domain.ts`

- [ ] **Step 1: Add columns to schema.sql**

Add `is_default` and `base_branch` to the `worktrees` table:

```sql
CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  base_branch TEXT,
  last_active_thread_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

- [ ] **Step 2: Update Worktree type in domain.ts**

```ts
export interface Worktree {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  isActive: boolean;
  isDefault: boolean;
  baseBranch: string | null;
  lastActiveThreadId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3: Run typecheck to find all call sites that need updating**

Run: `npx vue-tsc --noEmit 2>&1 | head -40`

This will reveal any places that construct `Worktree` objects without the new fields. Fix each one by adding `isDefault: false` (or `true` for the project default worktree) and `baseBranch: null`.

- [ ] **Step 4: Commit**

```bash
git add electron/storage/schema.sql src/shared/domain.ts
git commit -m "feat(schema): add isDefault and baseBranch to Worktree"
```

---

### Task 2: Store Migration and Methods

**Files:**
- Modify: `electron/storage/store.ts`
- Modify: `electron/storage/__tests__/store.test.ts`

- [ ] **Step 1: Write failing test for migration adding new columns**

In `store.test.ts`, add a test that opens a DB with the old schema (use `LEGACY_THREADS_WITH_SORT_ORDER_SCHEMA`), migrates to the new schema, and verifies that existing worktrees get `is_default = 0` and `base_branch = NULL`:

```ts
it("adds is_default and base_branch columns during migration", () => {
  const baseDir = makeTempDir();
  const dbPath = path.join(baseDir, "workspace.db");

  // Create DB with old schema (no is_default / base_branch)
  const db = new Database(dbPath);
  db.exec(LEGACY_THREADS_WITH_SORT_ORDER_SCHEMA);
  db.prepare(
    "INSERT INTO app_state (id, active_project_id, active_worktree_id, active_thread_id) VALUES (1, NULL, NULL, NULL)"
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, repo_path, status, created_at, updated_at) VALUES ('p1', 'test', '/tmp/test', 'idle', '2026-04-07T00:00:00Z', '2026-04-07T00:00:00Z')"
  ).run();
  db.prepare(
    "INSERT INTO worktrees (id, project_id, name, branch, path, is_active, created_at, updated_at) VALUES ('w1', 'p1', 'main', 'main', '/tmp/test', 1, '2026-04-07T00:00:00Z', '2026-04-07T00:00:00Z')"
  ).run();
  db.close();

  const store = new WorkspaceStore(baseDir);
  store.migrate(NEW_SCHEMA);

  const snapshot = store.getSnapshot();
  const worktree = snapshot.worktrees.find((w) => w.id === "w1");
  expect(worktree?.isDefault).toBe(false);
  expect(worktree?.baseBranch).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/storage/__tests__/store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `isDefault` property doesn't exist on the returned worktree.

- [ ] **Step 3: Update store.ts migration and row mapping**

In `store.ts`, update the `migrate` method to add the new columns if they don't exist:

```ts
// Inside migrate(), after the existing migration logic:
const worktreeColumns = this.db.pragma("table_info(worktrees)") as Array<{ name: string }>;
const colNames = new Set(worktreeColumns.map((c) => c.name));
if (!colNames.has("is_default")) {
  this.db.exec("ALTER TABLE worktrees ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0");
}
if (!colNames.has("base_branch")) {
  this.db.exec("ALTER TABLE worktrees ADD COLUMN base_branch TEXT");
}
```

Update the worktree row mapper (the function that converts DB rows to `Worktree` objects) to include:

```ts
isDefault: Boolean(row.is_default),
baseBranch: row.base_branch ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/storage/__tests__/store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Write failing test for deleteWorktreeGroup**

```ts
it("deletes a worktree and all its threads", () => {
  const baseDir = makeTempDir();
  const store = new WorkspaceStore(baseDir);
  store.migrate(NEW_SCHEMA);
  store.upsertProject(makeProject());
  store.upsertWorktree(makeWorktree({ id: "wt-default", name: "main", branch: "main" }));
  store.upsertWorktree(makeWorktree({ id: "wt-feat", name: "feat/auth", branch: "feat/auth" }));
  store.upsertThread(makeThread({ id: "t1", worktreeId: "wt-feat" }));
  store.upsertThread(makeThread({ id: "t2", worktreeId: "wt-feat" }));
  store.upsertThread(makeThread({ id: "t3", worktreeId: "wt-default" }));

  store.deleteWorktreeGroup("wt-feat");

  const snapshot = store.getSnapshot();
  expect(snapshot.worktrees.map((w) => w.id)).toEqual(["wt-default"]);
  expect(snapshot.threads.map((t) => t.id)).toEqual(["t3"]);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run electron/storage/__tests__/store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `deleteWorktreeGroup` is not a function.

- [ ] **Step 7: Implement deleteWorktreeGroup in store.ts**

```ts
deleteWorktreeGroup(worktreeId: string): void {
  const tx = this.db.transaction(() => {
    this.db.prepare("DELETE FROM threads WHERE worktree_id = ?").run(worktreeId);
    this.db.prepare("DELETE FROM worktrees WHERE id = ?").run(worktreeId);
  });
  tx();
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run electron/storage/__tests__/store.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add electron/storage/store.ts electron/storage/__tests__/store.test.ts
git commit -m "feat(store): migrate worktree schema, add deleteWorktreeGroup"
```

---

### Task 3: IPC Types and Channels

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Add new IPC channels**

Add to `IPC_CHANNELS`:

```ts
workspaceCreateWorktreeGroup: "workspace:createWorktreeGroup",
workspaceDeleteWorktreeGroup: "workspace:deleteWorktreeGroup",
workspaceListBranches: "workspace:listBranches",
workspaceWorktreeHealth: "workspace:worktreeHealth",
```

- [ ] **Step 2: Add new input type**

```ts
export interface CreateWorktreeGroupInput {
  projectId: string;
  /** Existing branch name, or new branch to create. */
  branch: string;
  /** When creating a new branch, the base to branch from. Null if using existing branch. */
  baseBranch: string | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat(ipc): add worktree group channels and types"
```

---

### Task 4: WorkspaceService — Worktree Group Lifecycle

**Files:**
- Modify: `electron/services/workspaceService.ts`
- Modify: `electron/services/__tests__/workspaceService.test.ts`

- [ ] **Step 1: Write failing test for createWorktreeGroup**

```ts
describe("WorkspaceService.createWorktreeGroup", () => {
  it("creates a worktree with isDefault false and baseBranch", () => {
    const upsertWorktree = vi.fn();
    const setActiveState = vi.fn();
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [],
        threads: [],
        activeProjectId: "p1",
        activeWorktreeId: null,
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState,
      upsertWorktree,
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: vi.fn()
    };
    const mockGit = {
      worktreeAdd: vi.fn(async () => {}),
      branchList: vi.fn(async () => ["main", "develop"]),
      worktreeList: vi.fn(async () => [])
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    const result = await service.createWorktreeGroup({
      projectId: "p1",
      branch: "feat/auth",
      baseBranch: "main"
    });

    expect(result.isDefault).toBe(false);
    expect(result.baseBranch).toBe("main");
    expect(result.branch).toBe("feat/auth");
    expect(mockGit.worktreeAdd).toHaveBeenCalled();
    expect(upsertWorktree).toHaveBeenCalledWith(expect.objectContaining({
      isDefault: false,
      baseBranch: "main"
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `createWorktreeGroup` is not a function.

- [ ] **Step 3: Implement createWorktreeGroup**

Add a `GitAdapter` interface and update the `WorkspaceService` constructor:

```ts
export interface GitAdapter {
  worktreeAdd(repoPath: string, worktreePath: string, branch: string, baseBranch: string | null): Promise<void>;
  worktreeRemove(worktreePath: string): Promise<void>;
  worktreeList(repoPath: string): Promise<Array<{ path: string; branch: string }>>;
  branchList(repoPath: string): Promise<string[]>;
  pathExists(fsPath: string): Promise<boolean>;
}

export class WorkspaceService {
  constructor(
    private store: WorkspaceStore,
    private git?: GitAdapter
  ) {}

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
}
```

Note: The second constructor parameter is optional so existing call sites (`new WorkspaceService(store)`) continue to work without changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Write failing test for deleteWorktreeGroup**

```ts
describe("WorkspaceService.deleteWorktreeGroup", () => {
  it("removes git worktree and deletes store data", async () => {
    const deleteWorktreeGroupStore = vi.fn();
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [
          { id: "wt-default", projectId: "p1", path: "/tmp/repo", isDefault: true },
          { id: "wt-feat", projectId: "p1", path: "/tmp/repo/.worktrees/feat-auth", isDefault: false }
        ],
        threads: [],
        activeProjectId: "p1",
        activeWorktreeId: "wt-feat",
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: deleteWorktreeGroupStore
    };
    const mockGit = {
      worktreeAdd: vi.fn(),
      worktreeRemove: vi.fn(async () => {}),
      branchList: vi.fn(),
      worktreeList: vi.fn(async () => []),
      pathExists: vi.fn(async () => true)
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    await service.deleteWorktreeGroup("wt-feat");

    expect(mockGit.worktreeRemove).toHaveBeenCalledWith("/tmp/repo/.worktrees/feat-auth");
    expect(deleteWorktreeGroupStore).toHaveBeenCalledWith("wt-feat");
    expect(store.setActiveState).toHaveBeenCalledWith("p1", "wt-default", null);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 7: Implement deleteWorktreeGroup**

```ts
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
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 9: Write failing test for listBranches**

```ts
describe("WorkspaceService.listBranches", () => {
  it("returns branches from the git adapter", async () => {
    const mockGit = {
      worktreeAdd: vi.fn(),
      worktreeRemove: vi.fn(),
      branchList: vi.fn(async () => ["main", "develop", "feat/auth"]),
      worktreeList: vi.fn(async () => []),
      pathExists: vi.fn()
    };
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [],
        threads: [],
        activeProjectId: null,
        activeWorktreeId: null,
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: vi.fn()
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    const branches = await service.listBranches("p1");

    expect(branches).toEqual(["main", "develop", "feat/auth"]);
    expect(mockGit.branchList).toHaveBeenCalledWith("/tmp/repo");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 11: Implement listBranches**

```ts
async listBranches(projectId: string): Promise<string[]> {
  if (!this.git) throw new Error("Git adapter required for worktree operations");

  const snapshot = this.store.getSnapshot();
  const project = snapshot.projects.find((p) => p.id === projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  return this.git.branchList(project.repoPath);
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add electron/services/workspaceService.ts electron/services/__tests__/workspaceService.test.ts
git commit -m "feat(service): add createWorktreeGroup, deleteWorktreeGroup, listBranches"
```

---

### Task 5: Git Adapter Implementation

**Files:**
- Create: `electron/services/gitAdapter.ts`

- [ ] **Step 1: Create the simple-git based adapter**

```ts
import fs from "node:fs";
import { simpleGit } from "simple-git";
import type { GitAdapter } from "./workspaceService.js";

export function createGitAdapter(): GitAdapter {
  return {
    async worktreeAdd(repoPath, worktreePath, branch, baseBranch) {
      const git = simpleGit(repoPath);
      if (baseBranch) {
        await git.raw(["worktree", "add", "-b", branch, worktreePath, baseBranch]);
      } else {
        await git.raw(["worktree", "add", worktreePath, branch]);
      }
    },

    async worktreeRemove(worktreePath) {
      const parent = worktreePath.replace(/\/[^/]+\/?$/, "");
      const git = simpleGit(parent);
      await git.raw(["worktree", "remove", worktreePath, "--force"]);
    },

    async worktreeList(repoPath) {
      const git = simpleGit(repoPath);
      const raw = await git.raw(["worktree", "list", "--porcelain"]);
      const entries: Array<{ path: string; branch: string }> = [];
      let currentPath = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice("worktree ".length);
        } else if (line.startsWith("branch refs/heads/")) {
          entries.push({ path: currentPath, branch: line.slice("branch refs/heads/".length) });
        }
      }
      return entries;
    },

    async branchList(repoPath) {
      const git = simpleGit(repoPath);
      const result = await git.branchLocal();
      return result.all;
    },

    async pathExists(fsPath) {
      return fs.existsSync(fsPath);
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/gitAdapter.ts
git commit -m "feat(git): add GitAdapter implementation using simple-git"
```

---

### Task 6: IPC Handlers and Preload

**Files:**
- Modify: `electron/mainApp.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Import and instantiate GitAdapter in mainApp.ts**

At the top of `mainApp.ts`, import the adapter:

```ts
import { createGitAdapter } from "./services/gitAdapter.js";
```

In the `createApp` function (or wherever `WorkspaceService` is instantiated), pass the adapter:

```ts
const gitAdapter = createGitAdapter();
const workspaceService = new WorkspaceService(store, gitAdapter);
```

- [ ] **Step 2: Register new IPC handlers in mainApp.ts**

Add inside `registerIpc`:

```ts
ipcMain.handle(IPC_CHANNELS.workspaceCreateWorktreeGroup, async (_, payload: CreateWorktreeGroupInput) => {
  const worktree = await workspaceService.createWorktreeGroup(payload);
  emitWorkspaceDidChange();
  return worktree;
});

ipcMain.handle(IPC_CHANNELS.workspaceDeleteWorktreeGroup, async (_, payload: { worktreeId: string }) => {
  await workspaceService.deleteWorktreeGroup(payload.worktreeId);
  emitWorkspaceDidChange();
});

ipcMain.handle(IPC_CHANNELS.workspaceListBranches, async (_, payload: { projectId: string }) => {
  return workspaceService.listBranches(payload.projectId);
});

ipcMain.handle(IPC_CHANNELS.workspaceWorktreeHealth, async (_, payload: { worktreeId: string }) => {
  return workspaceService.checkWorktreeHealth(payload.worktreeId);
});
```

- [ ] **Step 3: Add `checkWorktreeHealth` to WorkspaceService**

```ts
async checkWorktreeHealth(worktreeId: string): Promise<{ exists: boolean }> {
  if (!this.git) throw new Error("Git adapter required");
  const snapshot = this.store.getSnapshot();
  const worktree = snapshot.worktrees.find((w) => w.id === worktreeId);
  if (!worktree) return { exists: false };
  const exists = await this.git.pathExists(worktree.path);
  return { exists };
}
```

- [ ] **Step 4: Expose new methods in preload.ts**

Add to the `workspaceApi` object:

```ts
createWorktreeGroup: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateWorktreeGroup, payload),
deleteWorktreeGroup: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDeleteWorktreeGroup, payload),
listBranches: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceListBranches, { projectId }),
worktreeHealth: (worktreeId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceWorktreeHealth, { worktreeId }),
```

- [ ] **Step 5: Update the existing `addProject` handler to set `isDefault: true`**

In `mainApp.ts`, the existing `workspaceAddProject` handler calls `workspaceService.addWorktree`. Update `addWorktree` in `workspaceService.ts` to accept an optional `isDefault` parameter:

```ts
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
```

Update the call in the `workspaceAddProject` handler:

```ts
workspaceService.addWorktree(project.id, branch, payload.repoPath, true);
```

- [ ] **Step 6: Run typecheck**

Run: `npx vue-tsc --noEmit 2>&1 | head -40`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add electron/mainApp.ts electron/preload.ts electron/services/workspaceService.ts
git commit -m "feat(ipc): register worktree group handlers and preload API"
```

---

### Task 7: Pinia Store Getters

**Files:**
- Modify: `src/stores/workspaceStore.ts`

- [ ] **Step 1: Add getters for thread grouping**

```ts
getters: {
  // ... existing getters ...

  /** The default worktree for the active project (main checkout). */
  defaultWorktree(state): Worktree | undefined {
    return state.worktrees.find(
      (w) => w.projectId === state.activeProjectId && w.isDefault
    );
  },

  /** Non-default worktrees for the active project (thread groups). */
  threadGroups(state): Worktree[] {
    return state.worktrees.filter(
      (w) => w.projectId === state.activeProjectId && !w.isDefault
    );
  },

  /** Threads in the default worktree (ungrouped). */
  ungroupedThreads(state): Thread[] {
    const defaultWt = state.worktrees.find(
      (w) => w.projectId === state.activeProjectId && w.isDefault
    );
    if (!defaultWt) return [];
    return state.threads.filter((t) => t.worktreeId === defaultWt.id);
  },

  /** Threads grouped by non-default worktree id. */
  groupedThreadsByWorktree(state): Map<string, Thread[]> {
    const groups = new Map<string, Thread[]>();
    const nonDefault = state.worktrees.filter(
      (w) => w.projectId === state.activeProjectId && !w.isDefault
    );
    for (const wt of nonDefault) {
      groups.set(
        wt.id,
        state.threads.filter((t) => t.worktreeId === wt.id)
      );
    }
    return groups;
  }
},
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/workspaceStore.ts
git commit -m "feat(store): add threadGroups, ungroupedThreads getters"
```

---

### Task 8: ThreadGroupHeader Component

**Files:**
- Create: `src/components/ThreadGroupHeader.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ChevronDown, ChevronRight, Trash2 } from "lucide-vue-next";
import { ref } from "vue";

const props = defineProps<{
  branch: string;
  baseBranch: string | null;
  threadCount: number;
  isStale: boolean;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  delete: [];
}>();

const menuOpen = ref(false);

function toggleMenu(e: Event): void {
  e.stopPropagation();
  menuOpen.value = !menuOpen.value;
}
</script>

<template>
  <div
    class="flex cursor-pointer items-center gap-1.5 border-t border-border px-2 py-1.5"
    :class="isStale ? 'opacity-60' : ''"
    role="button"
    :aria-expanded="!collapsed"
    :aria-label="`Thread group ${branch}`"
    @click="emit('toggle')"
  >
    <component
      :is="collapsed ? ChevronRight : ChevronDown"
      class="h-3 w-3 shrink-0 text-muted-foreground"
    />
    <span
      class="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none"
      :class="isStale
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-emerald-600/30 bg-emerald-600/10 text-emerald-500'"
    >
      🌿 {{ branch }}
    </span>
    <span
      v-if="baseBranch"
      class="truncate text-[10px] text-muted-foreground"
    >
      from {{ baseBranch }}
    </span>
    <span class="ml-auto flex items-center gap-1">
      <span class="text-[10px] text-muted-foreground">{{ threadCount }}</span>
      <div class="relative">
        <button
          type="button"
          class="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Thread group actions"
          @click="toggleMenu"
        >
          <ChevronDown class="h-2.5 w-2.5" />
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 top-full z-50 mt-0.5 min-w-[8rem] rounded-md border border-border bg-popover p-1 shadow-md"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
            @click.stop="emit('delete'); menuOpen = false"
          >
            <Trash2 class="h-3.5 w-3.5" />
            Delete group
          </button>
        </div>
      </div>
    </span>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ThreadGroupHeader.vue
git commit -m "feat(ui): add ThreadGroupHeader component"
```

---

### Task 9: WorktreeStaleCallout Component

**Files:**
- Create: `src/components/WorktreeStaleCallout.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { AlertTriangle } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";

defineProps<{
  branch: string;
}>();

const emit = defineEmits<{
  delete: [];
  dismiss: [];
}>();
</script>

<template>
  <div class="mx-2 my-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
    <div class="flex items-start gap-2">
      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div class="min-w-0 flex-1 space-y-1.5">
        <p class="text-xs leading-relaxed text-foreground">
          The worktree for <span class="font-medium text-emerald-500">{{ branch }}</span>
          was removed outside the app.
        </p>
        <div class="flex gap-1.5">
          <BaseButton type="button" variant="outline" size="xs" @click="emit('dismiss')">
            Keep group
          </BaseButton>
          <BaseButton type="button" variant="destructive" size="xs" @click="emit('delete')">
            Delete group &amp; threads
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WorktreeStaleCallout.vue
git commit -m "feat(ui): add WorktreeStaleCallout component"
```

---

### Task 10: BranchPicker Component

**Files:**
- Create: `src/components/BranchPicker.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  create: [branch: string, baseBranch: string | null];
  cancel: [];
}>();

const branches = ref<string[]>([]);
const loading = ref(true);
const branchInput = ref("");
const isNewBranch = ref(true);
const baseBranch = ref("main");
const showBranchDropdown = ref(false);

const filteredBranches = computed(() => {
  const q = branchInput.value.toLowerCase();
  if (!q) return branches.value;
  return branches.value.filter((b) => b.toLowerCase().includes(q));
});

const canCreate = computed(() => branchInput.value.trim().length > 0);

function getApi(): { listBranches?: (projectId: string) => Promise<string[]> } | null {
  return (typeof window !== "undefined" ? window.workspaceApi : null) as never;
}

onMounted(async () => {
  const api = getApi();
  if (api?.listBranches) {
    try {
      branches.value = await api.listBranches(props.projectId);
      if (branches.value.length > 0) {
        baseBranch.value = branches.value[0];
      }
    } catch {
      branches.value = [];
    }
  }
  loading.value = false;
});

function selectExistingBranch(branch: string): void {
  branchInput.value = branch;
  isNewBranch.value = false;
  showBranchDropdown.value = false;
}

function selectCreateNew(): void {
  isNewBranch.value = true;
  branchInput.value = "";
  showBranchDropdown.value = false;
}

function handleCreate(): void {
  const branch = branchInput.value.trim();
  if (!branch) return;
  emit("create", branch, isNewBranch.value ? baseBranch.value : null);
}
</script>

<template>
  <div class="mx-2 my-1.5 rounded-md border border-border bg-card p-2.5 shadow-sm">
    <p class="mb-2 text-xs font-semibold text-foreground">New Thread Group</p>

    <!-- Branch input -->
    <div class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Branch</label>
      <div class="relative">
        <input
          v-model="branchInput"
          type="text"
          class="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          :placeholder="loading ? 'Loading branches…' : 'Branch name'"
          @focus="showBranchDropdown = true"
        />
        <div
          v-if="showBranchDropdown && !loading"
          class="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-32 overflow-y-auto rounded-sm border border-border bg-popover shadow-md"
        >
          <button
            type="button"
            class="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs text-emerald-500 hover:bg-accent"
            @click="selectCreateNew"
          >
            ✨ Create new branch…
          </button>
          <button
            v-for="branch in filteredBranches"
            :key="branch"
            type="button"
            class="flex w-full items-center px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
            @click="selectExistingBranch(branch)"
          >
            {{ branch }}
          </button>
        </div>
      </div>
    </div>

    <!-- Base branch (only for new branches) -->
    <div v-if="isNewBranch" class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Base branch</label>
      <select
        v-model="baseBranch"
        class="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option v-for="branch in branches" :key="branch" :value="branch">{{ branch }}</option>
      </select>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-1.5">
      <BaseButton type="button" variant="outline" size="xs" @click="emit('cancel')">
        Cancel
      </BaseButton>
      <BaseButton type="button" size="xs" :disabled="!canCreate" @click="handleCreate">
        Create
      </BaseButton>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BranchPicker.vue
git commit -m "feat(ui): add BranchPicker component"
```

---

### Task 11: ThreadCreateButton — Add Thread Group Option

**Files:**
- Modify: `src/components/ThreadCreateButton.vue`

- [ ] **Step 1: Add `createWorktreeGroup` emit and menu option**

Add a new emit:

```ts
const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  createWorktreeGroup: [];
}>();
```

In the template, add a divider and "New Thread Group" button after the agent grid inside the Teleport menu:

```html
<div class="mt-1.5 border-t border-border pt-1.5">
  <button
    type="button"
    role="menuitem"
    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
    @click="emit('createWorktreeGroup'); popoverOpen = false"
  >
    <span class="text-sm">🌿</span>
    <span>New Thread Group</span>
  </button>
  <p class="px-2 pt-0.5 text-[9px] text-muted-foreground">
    Uses git worktrees for isolation
  </p>
</div>
```

- [ ] **Step 2: Update ThreadTopBar to forward the new event**

In `ThreadTopBar.vue`, add the emit and forward it:

```ts
const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  createWorktreeGroup: [];
}>();
```

In the template, on the `ThreadCreateButton`:

```html
<ThreadCreateButton
  ref="createButtonRef"
  @create-with-agent="emit('createWithAgent', $event)"
  @create-worktree-group="emit('createWorktreeGroup')"
>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ThreadCreateButton.vue src/components/ThreadTopBar.vue
git commit -m "feat(ui): add thread group creation to create button menu"
```

---

### Task 12: ThreadSidebar — Grouped Layout

**Files:**
- Modify: `src/components/ThreadSidebar.vue`
- Modify: `src/components/__tests__/ThreadSidebar.test.ts`

- [ ] **Step 1: Write failing test for grouped rendering**

In `ThreadSidebar.test.ts`, add:

```ts
it("renders threads grouped by worktree with group headers", () => {
  const ungroupedThreads: Thread[] = [
    {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Ungrouped thread",
      agent: "claude",
      sortOrder: 0,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    }
  ];
  const groupedThreads: Thread[] = [
    {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      sortOrder: 0,
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    }
  ];

  wrapper = mount(ThreadSidebar, {
    props: {
      threads: [...ungroupedThreads, ...groupedThreads],
      activeThreadId: "t1",
      threadGroups: [
        {
          id: "w-feat",
          projectId: "p1",
          name: "feat/auth",
          branch: "feat/auth",
          path: "/tmp/.worktrees/feat-auth",
          isActive: true,
          isDefault: false,
          baseBranch: "main",
          lastActiveThreadId: null,
          createdAt: "2026-04-07T00:00:00Z",
          updatedAt: "2026-04-07T00:00:00Z"
        }
      ],
      defaultWorktreeId: "w-default"
    }
  });

  expect(wrapper.find('[data-testid="thread-group-header"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="thread-group-header"]').text()).toContain("feat/auth");
  expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ThreadSidebar.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Update ThreadSidebar props**

Add new props:

```ts
const props = withDefaults(
  defineProps<{
    threads: Thread[];
    activeThreadId: string | null;
    collapsed?: boolean;
    runStatusByThreadId?: Record<string, RunStatus> | null;
    threadsNeedingAttention?: ReadonlySet<string> | null;
    /** Non-default worktrees (thread groups). */
    threadGroups?: Worktree[];
    /** ID of the default worktree — threads with this worktreeId are "ungrouped". */
    defaultWorktreeId?: string | null;
    /** Worktree IDs whose path no longer exists on disk. */
    staleWorktreeIds?: ReadonlySet<string>;
  }>(),
  {
    collapsed: false,
    runStatusByThreadId: null,
    threadsNeedingAttention: null,
    threadGroups: () => [],
    defaultWorktreeId: null,
    staleWorktreeIds: () => new Set()
  }
);
```

Add new emits:

```ts
const emit = defineEmits<{
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, title: string];
  reorder: [orderedThreadIds: string[]];
  createWithAgent: [agent: ThreadAgent];
  createWorktreeGroup: [];
  deleteWorktreeGroup: [worktreeId: string];
  collapse: [];
  expand: [];
}>();
```

- [ ] **Step 4: Add computed properties for thread partitioning**

```ts
const ungroupedThreads = computed(() => {
  if (!props.defaultWorktreeId) return props.threads;
  return props.threads.filter((t) => t.worktreeId === props.defaultWorktreeId);
});

const groupData = computed(() => {
  return (props.threadGroups ?? []).map((wt) => ({
    worktree: wt,
    threads: props.threads.filter((t) => t.worktreeId === wt.id),
    isStale: props.staleWorktreeIds?.has(wt.id) ?? false
  }));
});

const collapsedGroups = ref<Set<string>>(new Set());

function toggleGroup(worktreeId: string): void {
  const next = new Set(collapsedGroups.value);
  if (next.has(worktreeId)) {
    next.delete(worktreeId);
  } else {
    next.add(worktreeId);
  }
  collapsedGroups.value = next;
}
```

- [ ] **Step 5: Update the template**

Replace the existing `<ul>` block that renders a flat thread list. The new structure:

```html
<div v-else class="min-h-0 flex-1 overflow-y-auto pb-3 pt-2">
  <!-- Ungrouped threads -->
  <ul class="space-y-0.5 px-2">
    <li
      v-for="thread in ungroupedRenderedThreads"
      :key="thread.id"
      :data-testid="`thread-list-item-${thread.id}`"
    >
      <ThreadRow
        :thread="thread"
        :collapsed="collapsed"
        :is-active="thread.id === activeThreadId"
        :run-status="runStatusByThreadId?.[thread.id] ?? null"
        :needs-attention="threadsNeedingAttention?.has(thread.id) ?? false"
        :is-dragging="thread.id === draggedThreadId"
        :is-drag-target="draggedThreadId !== null && thread.id === dragOverThreadId"
        @dragstart="handleDragStart(thread.id, $event)"
        @dragend="handleDragEnd"
        @keyboard-reorder="handleKeyboardReorder(thread.id, $event)"
        @select="emit('select', thread.id)"
        @remove="emit('remove', thread.id)"
        @rename="(title) => emit('rename', thread.id, title)"
      />
    </li>
  </ul>

  <!-- Thread groups -->
  <div v-for="group in groupData" :key="group.worktree.id">
    <ThreadGroupHeader
      data-testid="thread-group-header"
      :branch="group.worktree.branch"
      :base-branch="group.worktree.baseBranch"
      :thread-count="group.threads.length"
      :is-stale="group.isStale"
      :collapsed="collapsedGroups.has(group.worktree.id)"
      @toggle="toggleGroup(group.worktree.id)"
      @delete="emit('deleteWorktreeGroup', group.worktree.id)"
    />

    <WorktreeStaleCallout
      v-if="group.isStale && group.threads.length > 0"
      :branch="group.worktree.branch"
      @delete="emit('deleteWorktreeGroup', group.worktree.id)"
      @dismiss="/* keep group, no action */"
    />

    <ul
      v-show="!collapsedGroups.has(group.worktree.id)"
      class="space-y-0.5 px-2"
      :class="collapsed ? '' : 'pl-5'"
    >
      <li
        v-for="thread in group.threads"
        :key="thread.id"
        :data-testid="`thread-list-item-${thread.id}`"
      >
        <ThreadRow
          :thread="thread"
          :collapsed="collapsed"
          :is-active="thread.id === activeThreadId"
          :run-status="runStatusByThreadId?.[thread.id] ?? null"
          :needs-attention="threadsNeedingAttention?.has(thread.id) ?? false"
          :is-dragging="thread.id === draggedThreadId"
          :is-drag-target="draggedThreadId !== null && thread.id === dragOverThreadId"
          @dragstart="handleDragStart(thread.id, $event)"
          @dragend="handleDragEnd"
          @keyboard-reorder="handleKeyboardReorder(thread.id, $event)"
          @select="emit('select', thread.id)"
          @remove="emit('remove', thread.id)"
          @rename="(title) => emit('rename', thread.id, title)"
        />
      </li>
    </ul>
  </div>
</div>
```

Add the component imports at the top of `<script setup>`:

```ts
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";
import WorktreeStaleCallout from "@/components/WorktreeStaleCallout.vue";
```

Note: The existing drag-and-drop logic (`renderedThreads`, `handleDragStart`, etc.) needs to be adapted. The `ungroupedRenderedThreads` computed should use the same drag-reorder logic but filtered to ungrouped threads only. Thread groups support drag reorder within their own group but not across groups (matching the fixed membership rule).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ThreadSidebar.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ThreadSidebar.vue src/components/__tests__/ThreadSidebar.test.ts
git commit -m "feat(ui): render thread groups in sidebar with collapsible sections"
```

---

### Task 13: WorkspaceLayout Wiring

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Add state for the branch picker and stale worktrees**

```ts
const showBranchPicker = ref(false);
const staleWorktreeIds = ref<Set<string>>(new Set());
```

- [ ] **Step 2: Add handler for creating a worktree group**

```ts
async function handleCreateWorktreeGroup(branch: string, baseBranch: string | null): Promise<void> {
  const api = getApi();
  const projectId = workspace.activeProjectId;
  if (!api?.createWorktreeGroup || !projectId) return;

  try {
    await api.createWorktreeGroup({ projectId, branch, baseBranch });
    showBranchPicker.value = false;
    await refreshSnapshot();
  } catch (e) {
    toast.error(
      "Could not create thread group",
      e instanceof Error ? e.message : "Something went wrong."
    );
  }
}
```

- [ ] **Step 3: Add handler for deleting a worktree group**

```ts
async function handleDeleteWorktreeGroup(worktreeId: string): Promise<void> {
  const api = getApi();
  if (!api?.deleteWorktreeGroup) return;

  try {
    await api.deleteWorktreeGroup({ worktreeId });
    await refreshSnapshot();
  } catch (e) {
    toast.error(
      "Could not delete thread group",
      e instanceof Error ? e.message : "Something went wrong."
    );
  }
}
```

- [ ] **Step 4: Add worktree health polling**

```ts
let healthInterval: ReturnType<typeof setInterval> | null = null;

async function checkWorktreeHealth(): Promise<void> {
  const api = getApi();
  if (!api?.worktreeHealth) return;

  const nextStale = new Set<string>();
  for (const wt of workspace.threadGroups) {
    const { exists } = await api.worktreeHealth(wt.id);
    if (!exists) nextStale.add(wt.id);
  }
  staleWorktreeIds.value = nextStale;
}

onMounted(() => {
  healthInterval = setInterval(checkWorktreeHealth, 60_000);
  void checkWorktreeHealth();
});

onBeforeUnmount(() => {
  if (healthInterval) clearInterval(healthInterval);
});
```

- [ ] **Step 5: Pass new props to ThreadSidebar**

Update the `<ThreadSidebar>` in the template:

```html
<ThreadSidebar
  ref="threadSidebarRef"
  class="min-h-0 min-w-0 flex-1"
  :collapsed="threadsSidebarCollapsed"
  :threads="workspace.activeThreads"
  :active-thread-id="workspace.activeThreadId"
  :run-status-by-thread-id="runs.statusByThreadId"
  :threads-needing-attention="threadsNeedingAttention"
  :thread-groups="workspace.threadGroups"
  :default-worktree-id="workspace.defaultWorktree?.id ?? null"
  :stale-worktree-ids="staleWorktreeIds"
  @create-with-agent="handleCreateThreadWithAgent"
  @create-worktree-group="showBranchPicker = true"
  @delete-worktree-group="handleDeleteWorktreeGroup"
  @select="handleSelectThread"
  @remove="handleRemoveThread"
  @rename="handleRenameThread"
  @reorder="handleReorderThreads"
  @collapse="threadsSidebarCollapsed = true"
  @expand="threadsSidebarCollapsed = false"
/>
```

- [ ] **Step 6: Add the BranchPicker below the sidebar**

Inside the sidebar section, conditionally render the `BranchPicker`:

```html
<BranchPicker
  v-if="showBranchPicker && workspace.activeProjectId"
  :project-id="workspace.activeProjectId"
  @create="handleCreateWorktreeGroup"
  @cancel="showBranchPicker = false"
/>
```

Import the component:

```ts
import BranchPicker from "@/components/BranchPicker.vue";
```

- [ ] **Step 7: Update `activeThreads` getter to return all threads for the active project**

Currently `activeThreads` filters by `activeWorktreeId`. For the sidebar to show all thread groups, we need threads across all worktrees for the project. Update `workspaceStore.ts`:

```ts
/** All threads for the active project (across all worktrees). */
activeProjectThreads(state): Thread[] {
  return state.threads.filter((t) =>
    state.worktrees.some(
      (w) => w.id === t.worktreeId && w.projectId === state.activeProjectId
    )
  );
},
```

Pass `workspace.activeProjectThreads` to the sidebar instead of `workspace.activeThreads`.

- [ ] **Step 8: Update thread selection to switch worktree context**

When a user clicks a thread in a different worktree, the `handleSelectThread` function should also switch the active worktree:

```ts
function handleSelectThread(threadId: string): void {
  const thread = workspace.threads.find((t) => t.id === threadId);
  if (!thread) return;

  const needsWorktreeSwitch = thread.worktreeId !== workspace.activeWorktreeId;
  if (needsWorktreeSwitch) {
    const api = getApi();
    if (api) {
      void api.setActive({
        projectId: workspace.activeProjectId,
        worktreeId: thread.worktreeId,
        threadId
      });
    }
  } else {
    workspace.setActiveThread(threadId);
    const api = getApi();
    if (api) {
      void api.setActiveThread(threadId);
    }
  }
}
```

- [ ] **Step 9: Run typecheck and tests**

Run: `npx vue-tsc --noEmit 2>&1 | head -40`
Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: No type errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue src/stores/workspaceStore.ts src/components/BranchPicker.vue
git commit -m "feat: wire worktree group lifecycle into WorkspaceLayout"
```

---

### Task 14: External Worktree Discovery

**Files:**
- Modify: `electron/services/workspaceService.ts`
- Modify: `electron/services/__tests__/workspaceService.test.ts`

- [ ] **Step 1: Write failing test for discoverExternalWorktrees**

```ts
describe("WorkspaceService.discoverExternalWorktrees", () => {
  it("imports worktrees found on disk but not in DB", async () => {
    const upsertWorktree = vi.fn();
    const deleteWorktreeGroupFn = vi.fn();
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [
          { id: "wt-default", projectId: "p1", path: "/tmp/repo", isDefault: true, branch: "main" }
        ],
        threads: [],
        activeProjectId: "p1",
        activeWorktreeId: "wt-default",
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree,
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: deleteWorktreeGroupFn
    };
    const mockGit = {
      worktreeAdd: vi.fn(),
      worktreeRemove: vi.fn(),
      branchList: vi.fn(),
      worktreeList: vi.fn(async () => [
        { path: "/tmp/repo", branch: "main" },
        { path: "/tmp/repo/.worktrees/feat-auth", branch: "feat/auth" }
      ]),
      pathExists: vi.fn(async () => true)
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    await service.discoverExternalWorktrees("p1");

    expect(upsertWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: "feat/auth",
        path: "/tmp/repo/.worktrees/feat-auth",
        isDefault: false,
        baseBranch: null
      })
    );
  });

  it("removes empty thread groups (no threads)", async () => {
    const deleteWorktreeGroupFn = vi.fn();
    const store = {
      getSnapshot: vi.fn(() => ({
        projects: [{ id: "p1", repoPath: "/tmp/repo" }],
        worktrees: [
          { id: "wt-default", projectId: "p1", path: "/tmp/repo", isDefault: true, branch: "main" },
          { id: "wt-empty", projectId: "p1", path: "/tmp/repo/.worktrees/old", isDefault: false, branch: "old" }
        ],
        threads: [],
        activeProjectId: "p1",
        activeWorktreeId: "wt-default",
        activeThreadId: null
      })),
      upsertProject: vi.fn(),
      setActiveState: vi.fn(),
      upsertWorktree: vi.fn(),
      upsertThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      getThread: vi.fn(),
      nextThreadSortOrder: vi.fn(),
      reorderThreads: vi.fn(),
      deleteWorktreeGroup: deleteWorktreeGroupFn
    };
    const mockGit = {
      worktreeAdd: vi.fn(),
      worktreeRemove: vi.fn(),
      branchList: vi.fn(),
      worktreeList: vi.fn(async () => [
        { path: "/tmp/repo", branch: "main" }
      ]),
      pathExists: vi.fn(async (p: string) => p === "/tmp/repo")
    };
    const service = new WorkspaceService(store as never, mockGit as never);

    await service.discoverExternalWorktrees("p1");

    expect(deleteWorktreeGroupFn).toHaveBeenCalledWith("wt-empty");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Implement discoverExternalWorktrees**

```ts
async discoverExternalWorktrees(projectId: string): Promise<void> {
  if (!this.git) throw new Error("Git adapter required");

  const snapshot = this.store.getSnapshot();
  const project = snapshot.projects.find((p) => p.id === projectId);
  if (!project) return;

  const diskWorktrees = await this.git.worktreeList(project.repoPath);
  const knownPaths = new Set(
    snapshot.worktrees
      .filter((w) => w.projectId === projectId)
      .map((w) => w.path)
  );

  // Import worktrees found on disk but not in DB
  for (const dw of diskWorktrees) {
    if (knownPaths.has(dw.path)) continue;
    // Skip the main repo path (already the default worktree)
    if (dw.path === project.repoPath) continue;

    const now = new Date().toISOString();
    this.store.upsertWorktree({
      id: randomUUID(),
      projectId,
      name: dw.branch,
      branch: dw.branch,
      path: dw.path,
      isActive: true,
      isDefault: false,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: now,
      updatedAt: now
    });
  }

  // Remove empty thread groups whose worktree no longer exists on disk
  const diskPaths = new Set(diskWorktrees.map((dw) => dw.path));
  const projectWorktrees = snapshot.worktrees.filter((w) => w.projectId === projectId && !w.isDefault);
  for (const wt of projectWorktrees) {
    const hasThreads = snapshot.threads.some((t) => t.worktreeId === wt.id);
    const existsOnDisk = diskPaths.has(wt.path);
    if (!hasThreads && !existsOnDisk) {
      this.store.deleteWorktreeGroup(wt.id);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/services/__tests__/workspaceService.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Call discoverExternalWorktrees from the getSnapshot IPC handler**

In `mainApp.ts`, update the `workspaceGetSnapshot` handler to run discovery before returning the snapshot:

```ts
ipcMain.handle(IPC_CHANNELS.workspaceGetSnapshot, async () => {
  const snapshot = workspaceService.getSnapshot();
  if (snapshot.activeProjectId) {
    await workspaceService.discoverExternalWorktrees(snapshot.activeProjectId);
  }
  return workspaceService.getSnapshot();
});
```

- [ ] **Step 6: Commit**

```bash
git add electron/services/workspaceService.ts electron/services/__tests__/workspaceService.test.ts electron/mainApp.ts
git commit -m "feat: discover external worktrees and clean up empty groups"
```

---

### Task 15: Fix Existing Tests and Final Typecheck

**Files:**
- Modify: various test files as needed

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -40`

Fix any failures caused by:
- Missing `isDefault` / `baseBranch` in test fixtures (add `isDefault: false, baseBranch: null` to `makeWorktree` defaults)
- New props on `ThreadSidebar` that tests don't provide (add defaults)
- Updated `WorkspaceService` constructor signature (tests using `new WorkspaceService(store)` should still work since `git` is optional)

- [ ] **Step 2: Run typecheck**

Run: `npx vue-tsc --noEmit 2>&1 | head -40`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix: update test fixtures for worktree isDefault/baseBranch fields"
```

---

### Task 16: Manual Integration Test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev:electron`

- [ ] **Step 2: Verify the following flows work end-to-end:**

1. Open a project — the default worktree is created with `isDefault: true`
2. Click the "+" thread button — the dropdown shows "New Thread Group" at the bottom
3. Click "New Thread Group" — the inline branch picker appears in the sidebar
4. Select "Create new branch" and type `feat/test`, pick `main` as base — a new thread group appears in the sidebar
5. Create a thread inside the group — terminal opens at the worktree path
6. Switch between ungrouped thread and grouped thread — agent/diff/files/terminals all switch context
7. Delete the thread group — worktree is removed, threads are deleted, sidebar updates
8. Create a git worktree externally via CLI — on next snapshot refresh, it appears in the sidebar
