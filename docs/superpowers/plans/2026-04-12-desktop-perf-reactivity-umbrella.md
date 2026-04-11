# Desktop perf & reactivity umbrella — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Electron desktop app to reduce reactive and IPC overhead (layout decomposition, narrower watchers, bounded diff merge cache, optional safe IPC coalescing) with **no intentional user-visible behavior change** and **no security regression**.

**Architecture:** Work lands on integration branch `perf/desktop-reactivity-umbrella` with frequent sync from `main`. Prefer **new composables and child components** first, then thin `WorkspaceLayout.vue` wiring PRs to satisfy the single-owner rule for that file. Shared utilities (`lruMap`) get unit tests; Vue components get Vitest where logic is extractable and manual smoke for integration.

**Tech stack:** Vue 3 (`<script setup>`), TypeScript, Vitest, Electron `window.workspaceApi`, CodeMirror 6, xterm.js.

**Spec:** `docs/superpowers/specs/2026-04-12-desktop-perf-reactivity-umbrella-design.md`

---

## File map (create / touch)

| Path | Role |
|------|------|
| `apps/desktop/src/lib/lruMap.ts` | Generic insertion-ordered LRU `set`/`get`/`delete` with max size (or equivalent helpers) |
| `apps/desktop/src/lib/__tests__/lruMap.test.ts` | Unit tests for eviction order and touch-on-read |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | SCM state, `diffCache`, center/shell layout orchestration (shrink over tasks) |
| `apps/desktop/src/composables/useWorkspaceScmMergeCache.ts` (name flexible) | Optional: isolate merge cache + `loadSelectedMerge` helpers if layout split needs it |
| `apps/desktop/src/components/contextQueue/ContextQueueReviewDropdown.vue` | Replace deep watch on `props.items` |
| `apps/desktop/src/components/contextQueue/ContextQueueSelectionPopup.vue` | Remove unnecessary `deep: true` on `[visible, anchor]` |
| `apps/desktop/src/components/AgentCommandsSettingsDialog.vue` | Replace deep watch on `props.commands` |
| `apps/desktop/src/components/FileSearchEditor.vue` | Watcher audit / consolidation |
| `apps/desktop/src/components/CodeMirrorEditor.vue` | Watcher audit / consolidation |
| `apps/desktop/src/components/TerminalPane.vue` | Optional `ptyResize` coalescing behind rAF + trailing flush |
| New under `apps/desktop/src/components/workspace/` (optional) | Child shells: e.g. `WorkspaceCenterPane.vue`, `WorkspaceShellOverlay.vue` to trim `WorkspaceLayout` template |

---

### Task 0: Integration branch and merge rules

**Files:** (git only)

- [ ] **Step 1:** From latest `main`, create `perf/desktop-reactivity-umbrella` (rename if branch exists).

```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b perf/desktop-reactivity-umbrella
```

- [ ] **Step 2:** Document in PR description: merge or rebase **`main` into this branch daily** (team choice; avoid long-lived divergence); **at most one** concurrent PR may edit `apps/desktop/src/layouts/WorkspaceLayout.vue` substantially (others use new files + final wire-up).

- [ ] **Step 3:** Commit (optional meta-doc only if team keeps runbook in repo; otherwise PR text is enough).

---

### Task 1: LRU merge cache + worktree-safe keys (TDD)

**Rationale:** `WorkspaceLayout.vue` already caps `diffCache` at 24 entries by deleting `Map` insertion-order “oldest”, but **cache hits do not refresh LRU order** (`get` does not reorder). `cacheKey` is currently ``${scope}:${path}`` (`cacheKey` ~529–531) without `cwd`, which is weaker than the spec’s “fully qualified” key if `clear()` ordering ever regresses.

**Files:**
- Create: `apps/desktop/src/lib/lruMap.ts`
- Create: `apps/desktop/src/lib/__tests__/lruMap.test.ts`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue` (`diffCache`, `cacheKey`, `loadSelectedMerge` ~529–618)

- [ ] **Step 1: Write failing tests** for `LruMap` (or exported helpers): max size eviction removes **least recently used** after a `get` refreshes an entry.

```typescript
// apps/desktop/src/lib/__tests__/lruMap.test.ts
import { describe, expect, it } from "vitest";
import { LruMap } from "../lruMap";

describe("LruMap", () => {
  it("evicts least recently used after get refreshes order", () => {
    const m = new LruMap<string, number>(2);
    m.set("a", 1);
    m.set("b", 2);
    expect(m.get("a")).toBe(1); // touch a
    m.set("c", 3); // should evict b, not a
    expect(m.has("b")).toBe(false);
    expect(m.get("a")).toBe(1);
    expect(m.get("c")).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
cd apps/desktop && pnpm exec vitest run src/lib/__tests__/lruMap.test.ts
```

Expected: FAIL (module missing or methods missing).

- [ ] **Step 3: Implement** `LruMap` with `get`/`set`/`has`/`delete`/`clear` using `Map` delete+set for touch; enforce `maxSize` on `set`.

- [ ] **Step 4: Run tests (expect PASS)**

```bash
cd apps/desktop && pnpm exec vitest run src/lib/__tests__/lruMap.test.ts
```

- [ ] **Step 5: Integrate in `WorkspaceLayout.vue`**
  - Replace `const diffCache = new Map<...>(...)` with `new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX)` and a named constant (start from **24** to preserve current cap, or **64** if team agrees — document in PR).
  - Change `cacheKey` to include **active worktree cwd** using the same source as `loadSelectedMerge`: `workspace.activeWorktree?.path` (only after the same null-guards as today). Format e.g. `` `${cwd}\0${scope}\0${path}` `` so keys cannot collide across worktrees even if clear paths change.
  - On cache hit in `loadSelectedMerge`, use `diffCache.get` so LRU order updates.
  - Remove the manual `while (diffCache.size > 24)` loop; LRU handles eviction.

- [ ] **Step 6: Run desktop tests**

```bash
cd apps/desktop && pnpm test
```

Expected: all pass (fix any layout tests touching SCM if present).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/lib/lruMap.ts apps/desktop/src/lib/__tests__/lruMap.test.ts apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "perf(scm): LRU merge diff cache with worktree-qualified keys"
```

---

### Task 2: `ContextQueueReviewDropdown` — remove deep watch

**Files:**
- Modify: `apps/desktop/src/components/contextQueue/ContextQueueReviewDropdown.vue` (watch ~45–64)

- [ ] **Step 1:** Add a **cheap fingerprint** computed for queue contents when panel is open, e.g. `itemsFingerprint = computed(() => props.items.map((i) => `${i.id}:${i.pasteText.length}:...`).join("|"))` — tune to fields that must trigger `cloneItems` (ids + pasteText + review fields that matter). **Avoid** deep traversal of large blobs if not needed.

- [ ] **Step 2:** Replace `watch(() => props.items, ..., { deep: true })` with `watch(itemsFingerprint, () => { if (open.value) { ... } })` or `watch([open, itemsFingerprint], ...)`.

- [ ] **Step 3:** Add/adjust Vitest if there is an existing test file for this component; otherwise add `ContextQueueReviewDropdown.test.ts` with shallow mount + props change asserting internal list updates (minimal).

- [ ] **Step 4:** Manual smoke: open context queue review, reorder, edit row, confirm cancel paths unchanged.

```bash
cd apps/desktop && pnpm test && pnpm typecheck
```

- [ ] **Step 5: Commit** `refactor(context-queue): narrow review dropdown watcher`

---

### Task 3: `ContextQueueSelectionPopup` — drop deep watch

**Files:**
- Modify: `apps/desktop/src/components/contextQueue/ContextQueueSelectionPopup.vue` (watch ~78–93)

- [ ] **Step 1:** Replace `{ immediate: true, deep: true }` with `{ immediate: true }` **if** `props.anchor` is replaced as a whole object when position changes (verify call sites). If parents mutate `anchor` in place, instead watch a **scalarized** source:

```typescript
watch(
  () =>
    [
      props.visible,
      props.anchor?.left,
      props.anchor?.top,
      props.anchor?.width,
      props.anchor?.height
    ] as const,
  async () => { /* existing body */ },
  { immediate: true }
);
```

- [ ] **Step 2:** `pnpm test` + manual: open Queue popup on diff/file/terminal selection; resize window; scroll dismiss.

- [ ] **Step 3: Commit** `refactor(context-queue): avoid deep watch in selection popup`

---

### Task 4: `AgentCommandsSettingsDialog` — remove deep watch

**Files:**
- Modify: `apps/desktop/src/components/AgentCommandsSettingsDialog.vue` (watch ~203–210)

- [ ] **Step 1:** When dialog is closed, `draft` only needs to track **serialized** commands if `props.commands` is a stable object reference that mutates in place. Prefer:

```typescript
const commandsJson = computed(() => JSON.stringify(props.commands));
watch(commandsJson, () => {
  if (modelValue.value) return;
  draft.value = { ...props.commands };
});
```

**Security note:** `props.commands` is trusted app data (not remote JSON); stringify is for change detection only.

- [ ] **Step 2:** Create `apps/desktop/src/components/__tests__/AgentCommandsSettingsDialog.test.ts` (none exists today) with a minimal mount proving `draft` resyncs when dialog is closed and `props.commands` changes.

- [ ] **Step 3:** `pnpm test` + manual: open settings, change commands externally (if possible), close/reopen.

- [ ] **Step 4: Commit** `refactor(settings): narrow agent commands watcher`

---

### Task 5: Editor / search watcher audit

**Files:**
- Modify: `apps/desktop/src/components/FileSearchEditor.vue`
- Modify: `apps/desktop/src/components/CodeMirrorEditor.vue`
- Tests: extend nearest `__tests__` or add focused tests only if extracting pure helpers

**Done definition:** Before changing code, add a short markdown table (in PR description or `docs/` scratch — do not commit scratch if undesired) with columns: `file`, `watch #`, `source`, `side effect`, `decision` (`keep` / `merge with X` / `remove`). Every row must have a decision before merge.

- [ ] **Step 1:** In each file, **list all `watch` / `watchEffect`** calls (grep). For each, note source, side effect, and whether another watch duplicates the same work.

- [ ] **Step 2:** Consolidate only when semantics stay identical: merge chained watches on the same source; ensure **last** debounced value still runs (use `watch` + `flush: 'post'` or existing debounce utilities — do not drop trailing updates).

- [ ] **Step 3:** `pnpm test` + manual: file search query, mode switch, open file, editor settings toggles exercised by existing UI.

- [ ] **Step 4: Commit** `refactor(editors): consolidate redundant watchers`

---

### Task 6: `WorkspaceLayout.vue` decomposition (parallel-friendly)

**Goal:** Move large, cohesive blocks into composables/components **without** behavior change. Order suggested: **extract composables that do not shrink template first**, then child components, final PR touches template + imports.

**Scope note (matches spec):** Task 6 **must** shrink `WorkspaceLayout.vue` surface (terminal/shell overlay first). **Additional** extractions named in the spec — SCM/diff wiring, modal/dialog orchestration, context-queue toolbar wiring — are **in scope for the umbrella** but may land in a **follow-up PR** after Task 6 Step 5 if timeboxed; document which slices landed in each PR so nothing is silently dropped.

**Files:**
- Create: `apps/desktop/src/composables/useWorkspaceTerminalLayout.ts` (or split further) — terminal height, `splitContainerRef`, pointer resize handlers currently colocated with layout
- Create: `apps/desktop/src/components/workspace/WorkspaceShellOverlay.vue` — overlay shell header + `PillTabs` region (~1824+ in template) receiving props/events from parent
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue` — imports + template swap to child + `defineExpose` if parent uses refs

- [ ] **Step 1:** Extract **pure** helpers / constants (e.g. terminal height clamp) to a small `.ts` file with unit tests if math-heavy.

- [ ] **Step 2:** Extract **composable** for terminal panel state (`terminalPanelOpen`, `terminalPanelHeight`, resize pointer) — `WorkspaceLayout` calls composable and passes returned refs to template.

- [ ] **Step 3:** Extract **presentational** child `WorkspaceShellOverlay.vue`; pass `shellSlotIds`, tab models, handlers as props/emits; no new `workspaceApi` usage inside child unless moved deliberately (prefer keep IPC in parent).

- [ ] **Step 4:** `pnpm test && pnpm typecheck` + manual smoke: toggle terminal panel, resize handle, add/close shell tabs, agent tab unchanged.

- [ ] **Step 5: Commit** `refactor(workspace): extract shell overlay from layout`

- [ ] **Step 6 (optional second PR):** Repeat pattern for SCM header / pill tab bar / modals if layout still > ~1200 lines.

---

### Task 7: IPC coalescing — `ptyResize` only (optional, last)

**Files:**
- Modify: `apps/desktop/src/components/TerminalPane.vue` (`terminal.onResize` ~301–307)

- [ ] **Step 1:** **Audit** other high-frequency `workspaceApi` calls; document in PR if none qualify. **Do not** batch `ptyWrite` user input (ordering/security).

- [ ] **Step 2:** Implement **rAF-coalesced** resize: store pending **`{ sessionId, cols, rows }`** (or parallel `pendingSid` + `pendingDims`); schedule single `requestAnimationFrame` flush; flush sends **only if** `pendingSid === activeSessionId.value` at flush time (otherwise discard stale flush). On **`activeSessionId` change**, cancel scheduled rAF, clear pending, and **immediately** `ptyResize` the new session once with current `cols/rows` from the terminal so the correct PTY always receives the latest geometry.

```typescript
let pending: { sid: string; cols: number; rows: number } | null = null;
let resizeRaf = 0;
function flushPtyResize(): void {
  resizeRaf = 0;
  const api = getApi();
  const sid = activeSessionId.value;
  const p = pending;
  pending = null;
  if (!api || !p || !sid) return;
  if (p.sid !== sid) return; // stale: tab switched during rAF
  void api.ptyResize(sid, p.cols, p.rows);
}
function schedulePtyResize(sid: string, cols: number, rows: number) {
  pending = { sid, cols, rows };
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(flushPtyResize);
}
// Also: watch(activeSessionId, () => { cancelAnimationFrame(resizeRaf); resizeRaf = 0; pending = null; /* sync resize new sid */ })
```

- [ ] **Step 3:** Manual: rapid terminal pane drag / window resize — no stuck dimensions; switch sessions mid-resize.

- [ ] **Step 4:** If feasible, add a small test double / mock counting `ptyResize` invocations (component test); else document manual evidence.

- [ ] **Step 5: Commit** `perf(terminal): coalesce ptyResize via rAF`

---

## Manual smoke checklist (each task merge to umbrella)

1. Switch threads; agent terminal still receives focus rules as before.  
2. SCM: open diff, stage/unstage, merge view loads.  
3. Context queue: selection popup, review dropdown, confirm/cancel.  
4. File search: query, open file.  
5. Terminal: create shell tab, resize, type, close.

---

## Completion criteria

- [ ] All tasks merged; umbrella branch green (`pnpm test`, `pnpm typecheck` in `apps/desktop`).  
- [ ] PR summary lists **IPC coalescing** paths implemented or states **none** after audit.  
- [ ] No new preload APIs; no merged IPC handlers that skip validation.  
- [ ] **Optional:** scripted or manual stress for many distinct diff paths to confirm LRU cap stable (aligns with spec “memory stable under churn”); if omitted, note **deferred** in final PR.  
- [ ] Final merge of umbrella branch to `main` per team process.

---

## Plan execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-desktop-perf-reactivity-umbrella.md`.

**1. Subagent-driven (recommended)** — dispatch a fresh subagent per task; review between tasks (@superpowers:subagent-driven-development).

**2. Inline execution** — run tasks in this session with checkpoints (@superpowers:executing-plans).

Which approach do you want for implementation?
