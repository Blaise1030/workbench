# Technical Debt Analysis — instrument/apps/desktop

_Generated: 2026-04-21_

---

## Executive Summary

The desktop app is a well-structured Electron + Vue 3 + Vite project with strong test coverage and good architectural intent. However, three god-components have accumulated the majority of logic, the run store has a hot-path O(n) scan, and several reactive patterns add unnecessary overhead. Addressing these will noticeably reduce memory usage and re-render frequency.

---

## 1. God-Component Debt (Critical)

### 1a. `WorkspaceLayout.vue` — 2,278 lines

**Responsibilities crammed into one component:**
- All SCM state (`repoStatus`, `diffCache`, `selectedScmPath`, `selectedScmScope`, `scmMeta`, `hasGitRepository`)
- Thread navigation and active-thread management
- Keybinding wiring (delegates to `useWorkspaceKeybindings`, but integrates here)
- Worktree health polling (`setInterval` at line 1288)
- Terminal/PTY session management
- Layout panel sizing and collapse logic
- `provide()` calls for context-queue injection

**Symptoms:**
- 10+ `watch()` subscriptions (lines 1122, 1130, 1155, 1168, 1175, 1189, 1211+) — every workspace change triggers multiple watchers.
- Full `diffCache.clear()` called in 3+ places, plus manual LRU eviction duplicated inside the diff-load function (even though `LruMap` is already imported).
- Two sequential `refreshRepoStatus()` calls are wired independently by different watches.

**Recommended split:**
```
WorkspaceLayout.vue          → layout skeleton only (panels, slots)
useScmState.ts               → composable: all SCM refs, refreshRepoStatus, diffCache
useWorktreeHealth.ts         → composable: setInterval health check
useThreadNavigation.ts       → composable: prev/next thread, active-thread logic
```

### 1b. `FileSearchEditor.vue` — 2,176 lines

Combines file-tree browsing, fuzzy search, editor state, unsaved-change guards, context-queue injection, and IPC listeners. Should be split into:
- `FileTree.vue` — tree rendering
- `useFileSearch.ts` — search/filter logic
- `FileEditor.vue` — editor pane (already a CodeMirror wrapper, just integrate)

### 1c. `SourceControlPanel.vue` — 1,053 lines

Owns staging logic, section-select-all state, diff layout toggle, and the CodeMirror merge diff pane. Candidate for:
- `ScmFileList.vue` — checked-entry management, section headers
- `ScmDiffPane.vue` — diff viewer wrapper

---

## 2. Performance Hotspots

### 2a. `useRunStore` — O(n) linear scan on every append

```ts
// stores/runStore.ts
append(runId: string, line: string): void {
  const run = this.runs.find((r) => r.runId === runId); // O(n) scan
  if (run) run.output.push(line);
}
setStatus(runId: string, status: RunStatus): void {
  const run = this.runs.find((r) => r.runId === runId); // O(n) scan
  ...
}
```

Every PTY output line calls `append()` which scans the entire runs array. With long-running agents producing hundreds of lines per second this is measurable.

**Fix:** Index by `runId` with a `Map`:
```ts
state: () => ({
  runs: [] as RunConsole[],
  _index: new Map<string, RunConsole>()   // add to state
}),
actions: {
  append(runId, line) {
    this._index.get(runId)?.output.push(line);
  }
}
```

### 2b. Duplicate LRU eviction

`WorkspaceLayout.vue` imports `LruMap` but then also manually evicts entries after `diffCache.set()`:

```ts
while (diffCache.size > 24) {
  const oldest = diffCache.keys().next().value;
  if (!oldest) break;
  diffCache.delete(oldest);
}
```

`LruMap` presumably handles this automatically. The manual loop is dead code that runs on every diff load.

**Fix:** Remove the manual eviction loop; trust `LruMap`.

### 2c. Timer handles stored in `ref()`

```ts
// ThreadSidebar.vue
const collapsedPopoverHoverCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null);
```

Storing a timer ID in a reactive ref means Vue tracks it as a dependency. Any read of this ref inside a template/computed will re-run when the timer ID changes. Use a plain variable instead:

```ts
let collapsedPopoverHoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
```

Same pattern exists in `WorkspaceLayout.vue` (`worktreeHealthInterval`).

### 2d. Worktree health polling vs. event-driven

`setInterval(() => void checkWorktreeHealth(), 60_000)` polls every 60 s. The codebase already uses `gitHeadWatcher` with `chokidar` for reactive FS events. Health checks could be triggered by worktree-change events instead of a fixed timer, eliminating the interval entirely and reducing background IPC traffic.

### 2e. No list virtualisation

`ThreadSidebarNodes.vue` renders all threads with a plain `v-for`. If a workspace has 50+ threads across groups, all DOM nodes exist simultaneously. Consider `@tanstack/vue-virtual` or a windowed list for the thread list and file list in `FileSearchEditor`.

---

## 3. Architecture Debt

### 3a. SCM state in the layout component

All source-control state is owned by `WorkspaceLayout.vue` and passed as props through `ThreadSidebar → SourceControlPanel`. This makes `SourceControlPanel` a pure display component unable to initiate its own refreshes, while `WorkspaceLayout` becomes a giant controller.

**Fix:** Move SCM state into a dedicated Pinia store or composable. `SourceControlPanel` can then call `useScmStore()` directly.

### 3b. IPC payload types are `unknown`

The preload bridge exposes most IPC calls as `(payload: unknown) => ipcRenderer.invoke(...)`. Type safety ends at the bridge boundary. A shared type like `AddWorktreePayload` defined in `@shared/domain` and threaded through the preload typings would catch payload shape mismatches at compile time.

### 3c. `inject()` used without guaranteed provider

Multiple components call `inject(injectContextToAgentKey, undefined)` and then null-check the result. This means if a component is ever rendered outside the provider tree it silently degrades. The injection key should carry a default factory or the component should assert the provider exists.

---

## 4. CSS Debt

- `globals.css` uses `!important` overrides on CodeMirror internals (`background-image: none !important`). These make theming brittle. Prefer scoped component styles or CodeMirror extension APIs.
- Repeated identical Tailwind chains (e.g., the `.cm-search .cm-button` block duplicated across search and close-button rules) could be extracted to a shared `@apply` utility class.

---

## 5. Quick Wins (Low effort, high value)

| Item | File | Effort | Impact |
|---|---|---|---|
| Remove manual LRU eviction loop | WorkspaceLayout.vue | 10 min | Cleaner hot path |
| Change timer refs to plain vars | ThreadSidebar, WorkspaceLayout | 15 min | Fewer reactive deps |
| Add `_index` Map to `useRunStore` | runStore.ts | 30 min | O(1) append/setStatus |
| Remove duplicate `diffCache.clear()` watchers | WorkspaceLayout.vue | 20 min | Fewer redundant IPC calls |

---

## 6. Medium-Term (1–4 weeks)

| Item | Effort | Impact |
|---|---|---|
| Extract `useScmState` composable | 3 days | WorkspaceLayout < 1000 lines |
| Split `FileSearchEditor` into tree + editor | 3 days | Testability, re-render isolation |
| Add IPC payload types to shared domain | 2 days | Compile-time safety |
| Virtual list for thread sidebar | 2 days | Smooth at 100+ threads |

---

## 7. Long-Term (1–3 months)

| Item | Effort | Impact |
|---|---|---|
| Move SCM to Pinia store | 1 week | Removes prop-drilling through 3 layers |
| Replace health polling with FS event triggers | 3 days | Eliminates background IPC |
| WorkspaceLayout < 500 lines | 2 weeks | Maintainability, test isolation |

---

## 8. Debt Scorecard

| Category | Severity | Count |
|---|---|---|
| God components (>500 lines) | High | 4 |
| O(n) hot-path scans | High | 2 (`find` in runStore) |
| Duplicate eviction logic | Medium | 1 |
| Reactive timer handles | Low | 2 |
| Missing virtual scroll | Medium | 2 lists |
| Unknown IPC payloads | Medium | ~20 handlers |
| `!important` CSS overrides | Low | 3 |

**Priority order:** runStore index → timer refs → eviction dedup → SCM composable → FileSearchEditor split → virtual list.
