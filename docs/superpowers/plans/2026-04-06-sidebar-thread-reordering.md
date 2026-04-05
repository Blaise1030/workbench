# Sidebar Thread Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted drag-and-drop reordering for the active worktree's sidebar thread list.

**Architecture:** Persist a dedicated `sort_order` on `threads` so manual order is stable and independent from rename/run timestamps. The renderer will reorder the visible active-worktree list locally during drag/drop, then persist the final ordered thread IDs through a new Electron IPC path and refresh from the workspace snapshot.

**Tech Stack:** Vue 3 + TypeScript, Pinia, Electron IPC, better-sqlite3, Vitest + @vue/test-utils

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `electron/storage/schema.sql` | Add persistent `sort_order` column for threads |
| Modify | `src/shared/domain.ts` | Add `sortOrder` to `Thread` |
| Modify | `src/shared/ipc.ts` | Add reorder IPC channel and payload type |
| Modify | `src/env.d.ts` | Expose `reorderThreads` on `WorkspaceApi` |
| Modify | `electron/storage/store.ts` | Persist `sort_order`, migrate old rows, order snapshots by it, rewrite order transactionally |
| Create | `electron/storage/__tests__/store.test.ts` | Verify snapshot ordering and reorder persistence |
| Modify | `electron/services/workspaceService.ts` | Assign default sort order on create and expose reorder method |
| Modify | `electron/services/__tests__/workspaceService.test.ts` | Verify create/reorder behavior at service layer |
| Modify | `electron/main.ts` | Register reorder IPC handler |
| Modify | `electron/preload.ts` | Expose reorder IPC call to renderer |
| Modify | `src/components/ThreadSidebar.vue` | Add drag/drop UI state, optimistic reordering, reorder emit |
| Modify | `src/components/ThreadRow.vue` | Add drag handle / draggable affordance and drag state styling hooks |
| Modify | `src/components/__tests__/ThreadSidebar.test.ts` | Cover drag/drop reorder emit and visible ordering |
| Modify | `src/layouts/WorkspaceLayout.vue` | Persist reordered IDs, reconcile optimistic UI with snapshot refresh |
| Modify | `src/layouts/__tests__/WorkspaceLayout.test.ts` | Verify refreshed snapshot ordering still wins |

---

## Task 1: Add explicit thread ordering to the shared model and IPC contracts

**Files:**
- Modify: `src/shared/domain.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Write the failing contract test targets**

Identify existing type users that construct `Thread` literals:
- `src/components/__tests__/ThreadSidebar.test.ts`
- `src/layouts/__tests__/WorkspaceLayout.test.ts`
- `electron/services/__tests__/workspaceService.test.ts`

The next steps should intentionally break typecheck until `sortOrder` is added everywhere.

- [ ] **Step 2: Add `sortOrder` to the shared `Thread` type**

In `src/shared/domain.ts`, extend `Thread` with:

```ts
sortOrder: number;
```

- [ ] **Step 3: Add reorder IPC contract**

In `src/shared/ipc.ts`, add:

```ts
workspaceReorderThreads: "workspace:reorderThreads",
```

and a payload type:

```ts
export interface ReorderThreadsInput {
  worktreeId: string;
  orderedThreadIds: string[];
}
```

- [ ] **Step 4: Expose the preload contract in the renderer typings**

In `src/env.d.ts`, add:

```ts
reorderThreads: (payload: { worktreeId: string; orderedThreadIds: string[] }) => Promise<void>;
```

- [ ] **Step 5: Run typecheck to confirm the repo is red in the expected places**

Run: `npm run typecheck`

Expected:
- FAIL because existing thread fixtures do not yet include `sortOrder`

- [ ] **Step 6: Commit**

```bash
git add src/shared/domain.ts src/shared/ipc.ts src/env.d.ts
git commit -m "feat: add thread reorder IPC contract"
```

---

## Task 2: Make SQLite persist and return explicit thread order

**Files:**
- Modify: `electron/storage/schema.sql`
- Modify: `electron/storage/store.ts`
- Create: `electron/storage/__tests__/store.test.ts`

- [ ] **Step 1: Write the failing storage tests**

Create `electron/storage/__tests__/store.test.ts` with coverage for:

```ts
it("returns threads ordered by sortOrder within a worktree", () => { /* ... */ });
it("rewrites sortOrder for the provided worktree thread ids", () => { /* ... */ });
it("assigns appended sortOrder for legacy rows missing values after migration", () => { /* ... */ });
```

Use a temp database directory under `os.tmpdir()` and the real `WorkspaceStore`.

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `npm test -- electron/storage/__tests__/store.test.ts`

Expected:
- FAIL because `sort_order` and reorder support do not exist yet

- [ ] **Step 3: Add the schema column**

In `electron/storage/schema.sql`, add:

```sql
sort_order INTEGER NOT NULL DEFAULT 0,
```

to the `threads` table definition.

Add a migration-safe backfill in `WorkspaceStore.migrate()` using `ALTER TABLE ... ADD COLUMN` guarded by SQLite metadata checks if needed, then normalize legacy rows so every thread gets a deterministic order.

- [ ] **Step 4: Persist and query `sort_order` in `WorkspaceStore`**

Update `electron/storage/store.ts` to:
- include `sort_order` in `upsertThread`
- select `sort_order AS sortOrder` in `getThread()` and `getSnapshot()`
- order snapshot threads by `worktree_id`, then `sort_order`, with `created_at` or `id` only as a stable tie-breaker
- add a transactional `reorderThreads(worktreeId, orderedThreadIds)` method that rewrites `sort_order` sequentially for that worktree subset
- add a helper like `nextThreadSortOrder(worktreeId)` for thread creation

- [ ] **Step 5: Run the storage tests to verify they pass**

Run: `npm test -- electron/storage/__tests__/store.test.ts`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add electron/storage/schema.sql electron/storage/store.ts electron/storage/__tests__/store.test.ts
git commit -m "feat: persist thread sort order in workspace store"
```

---

## Task 3: Wire service, main, and preload support for reorder persistence

**Files:**
- Modify: `electron/services/workspaceService.ts`
- Modify: `electron/services/__tests__/workspaceService.test.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Write the failing service tests**

Extend `electron/services/__tests__/workspaceService.test.ts` with:

```ts
it("assigns the next sort order when creating a thread", () => { /* ... */ });
it("reorders threads for a worktree using ordered ids", () => { /* ... */ });
```

Mock store methods:
- `nextThreadSortOrder`
- `reorderThreads`

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `npm test -- electron/services/__tests__/workspaceService.test.ts`

Expected:
- FAIL because `WorkspaceService` does not set `sortOrder` or expose reorder behavior yet

- [ ] **Step 3: Update `WorkspaceService`**

In `electron/services/workspaceService.ts`:
- set `sortOrder: this.store.nextThreadSortOrder(input.worktreeId)` when creating a thread
- add `reorderThreads(worktreeId: string, orderedThreadIds: string[]): void`

- [ ] **Step 4: Add IPC handler and preload method**

In `electron/main.ts`, import `ReorderThreadsInput` and register:

```ts
ipcMain.handle(IPC_CHANNELS.workspaceReorderThreads, (_, payload: ReorderThreadsInput) => {
  workspaceService.reorderThreads(payload.worktreeId, payload.orderedThreadIds);
  emitWorkspaceDidChange();
});
```

In `electron/preload.ts`, expose:

```ts
reorderThreads: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceReorderThreads, payload),
```

- [ ] **Step 5: Run the service tests again**

Run: `npm test -- electron/services/__tests__/workspaceService.test.ts`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add electron/services/workspaceService.ts electron/services/__tests__/workspaceService.test.ts electron/main.ts electron/preload.ts
git commit -m "feat: wire thread reorder persistence through Electron"
```

---

## Task 4: Add drag-and-drop behavior to the sidebar (TDD)

**Files:**
- Modify: `src/components/ThreadSidebar.vue`
- Modify: `src/components/ThreadRow.vue`
- Modify: `src/components/__tests__/ThreadSidebar.test.ts`

- [ ] **Step 1: Write the failing sidebar drag/drop tests**

Extend `src/components/__tests__/ThreadSidebar.test.ts` with at least:

```ts
it("renders threads in the provided order", () => { /* assert t1|t2|t3 */ });
it("emits reorder with the new ordered ids after dragging a row below another row", async () => { /* simulate dragstart/dragenter/drop */ });
it("does not emit reorder when the drop target keeps the same order", async () => { /* no-op drag */ });
```

Use three thread fixtures with explicit `sortOrder` values.

- [ ] **Step 2: Run the sidebar tests to verify they fail**

Run: `npm test -- src/components/__tests__/ThreadSidebar.test.ts`

Expected:
- FAIL because the sidebar does not support drag/drop or reorder emits yet

- [ ] **Step 3: Implement row affordances**

In `src/components/ThreadRow.vue`:
- expose `draggable` and drag-state props/events needed by the sidebar
- add a visual drag handle or reorder affordance without breaking existing rename/delete behavior
- keep the row menu and inline rename intact

In `src/components/ThreadSidebar.vue`:
- add `reorder` to `defineEmits`
- track dragging thread id and current drop slot
- compute a local ordered list during drag
- emit `reorder` with the final ordered thread ids on drop
- keep drag constrained to the currently rendered sidebar list

- [ ] **Step 4: Run the sidebar tests to verify they pass**

Run: `npm test -- src/components/__tests__/ThreadSidebar.test.ts`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ThreadSidebar.vue src/components/ThreadRow.vue src/components/__tests__/ThreadSidebar.test.ts
git commit -m "feat: add sidebar drag and drop thread reordering"
```

---

## Task 5: Persist drag results from the workspace layout

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing layout test**

Extend `src/layouts/__tests__/WorkspaceLayout.test.ts` with a case that:
- mounts `WorkspaceLayout`
- stubs `ThreadSidebar` so it can emit `reorder`
- asserts `workspaceApi.reorderThreads` is called with the active worktree id and ordered thread ids
- asserts a subsequent snapshot refresh replaces the optimistic order with Electron state

- [ ] **Step 2: Run the layout tests to verify they fail**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts`

Expected:
- FAIL because `WorkspaceLayout` does not handle sidebar reorder events yet

- [ ] **Step 3: Implement layout persistence**

In `src/layouts/WorkspaceLayout.vue`:
- add a local handler like `handleReorderThreads(orderedThreadIds: string[])`
- optimistically reorder the relevant active-worktree threads in the Pinia store before awaiting IPC
- call `workspaceApi.reorderThreads({ worktreeId, orderedThreadIds })`
- refresh the snapshot afterward so Electron remains authoritative
- leave cross-worktree ordering untouched

- [ ] **Step 4: Run the layout tests to verify they pass**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat: persist sidebar thread order from workspace layout"
```

---

## Task 6: Full verification

**Files:**
- Modify: any touched files from Tasks 1-5 if verification finds issues

- [ ] **Step 1: Run the focused test suite**

Run:

```bash
npm test -- electron/storage/__tests__/store.test.ts electron/services/__tests__/workspaceService.test.ts src/components/__tests__/ThreadSidebar.test.ts src/layouts/__tests__/WorkspaceLayout.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Run repository-wide typecheck**

Run: `npm run typecheck`

Expected:
- PASS

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected:
- PASS

- [ ] **Step 4: Commit final fixes if verification changed code**

```bash
git add electron/storage/schema.sql electron/storage/store.ts electron/storage/__tests__/store.test.ts electron/services/workspaceService.ts electron/services/__tests__/workspaceService.test.ts electron/main.ts electron/preload.ts src/shared/domain.ts src/shared/ipc.ts src/env.d.ts src/components/ThreadSidebar.vue src/components/ThreadRow.vue src/components/__tests__/ThreadSidebar.test.ts src/layouts/WorkspaceLayout.vue src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "test: verify persisted sidebar thread reordering"
```
