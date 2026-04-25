# Vue Router Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `mainCenterTab` ref and `workspaceStore.active*` state with Vue Router as the single source of truth for active project, worktree branch, panel, and thread.

**Architecture:** Install `vue-router` with `createMemoryHistory()` (required for Electron). All navigation calls become `router.push()`. Active state is derived from route params via a `useActiveWorkspace()` composable. `workspaceStore` retains data arrays (projects, worktrees, threads) but drops the four `active*` id refs.

**Tech Stack:** Vue 3, Vue Router 4, Pinia, TypeScript, Electron, Vitest, `@vue/test-utils`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/desktop/src/router/branchParam.ts` | Create | `encodeBranch` / `decodeBranch` helpers |
| `apps/desktop/src/router/index.ts` | Create | Route definitions, memory history, navigation guard |
| `apps/desktop/src/composables/useActiveWorkspace.ts` | Create | Route-derived active project/worktree/thread computeds |
| `apps/desktop/src/test-utils/createTestRouter.ts` | Create | Test helper: memory-history router for component tests |
| `apps/desktop/src/main.ts` | Modify | Add `app.use(router)` |
| `apps/desktop/src/App.vue` | Modify | `<RouterView />` only |
| `apps/desktop/src/stores/workspaceStore.ts` | Modify | Remove `activeProjectId/Id/Id` state; update `hydrate()` return value; simplify `removeThreadLocal()` |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Modify | Replace `mainCenterTab` + `workspace.active*` with router; navigation functions → `router.push()` |
| `apps/desktop/src/composables/useThreadNavigation.ts` | Modify | `goPrevThread`/`goNextThread` → `router.push()` |
| `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts` | Modify | Add router plugin to all mounts |

---

## Task 1: Install vue-router

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add vue-router**

```bash
cd apps/desktop && pnpm add vue-router
```

Expected output: `+ vue-router@4.x.x`

- [ ] **Step 2: Verify installation**

```bash
node -e "require('vue-router'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml 2>/dev/null; git add apps/desktop/pnpm-lock.yaml 2>/dev/null; git commit -m "chore(deps): add vue-router"
```

---

## Task 2: Branch param helpers + tests

**Files:**
- Create: `apps/desktop/src/router/branchParam.ts`
- Create: `apps/desktop/src/router/__tests__/branchParam.test.ts`

Branch names can contain `/` which would break URL params. These helpers wrap `encodeURIComponent`/`decodeURIComponent`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/router/__tests__/branchParam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeBranch, encodeBranch } from "../branchParam";

describe("encodeBranch / decodeBranch", () => {
  it("round-trips a simple branch name", () => {
    expect(decodeBranch(encodeBranch("main"))).toBe("main");
  });

  it("encodes slashes in branch names", () => {
    const encoded = encodeBranch("feature/my-branch");
    expect(encoded).not.toContain("/");
    expect(decodeBranch(encoded)).toBe("feature/my-branch");
  });

  it("encodes spaces and special chars", () => {
    expect(decodeBranch(encodeBranch("fix #123 bug"))).toBe("fix #123 bug");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/desktop && pnpm test -- --reporter=verbose router/__tests__/branchParam
```

Expected: FAIL – `Cannot find module '../branchParam'`

- [ ] **Step 3: Create the helper**

Create `apps/desktop/src/router/branchParam.ts`:

```ts
export function encodeBranch(branch: string): string {
  return encodeURIComponent(branch);
}

export function decodeBranch(param: string): string {
  return decodeURIComponent(param);
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
cd apps/desktop && pnpm test -- --reporter=verbose router/__tests__/branchParam
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/router/
git commit -m "feat(router): add branch param encoding helpers"
```

---

## Task 3: Create router/index.ts

**Files:**
- Create: `apps/desktop/src/router/index.ts`

All workspace routes resolve to `WorkspaceLayout`. The route `name` tells WorkspaceLayout which panel to show. The welcome screen is shown when there are no route params (route name `'welcome'`).

- [ ] **Step 1: Create router/index.ts**

Create `apps/desktop/src/router/index.ts`:

```ts
import { createMemoryHistory, createRouter } from "vue-router";
import WorkspaceLayout from "@/layouts/WorkspaceLayout.vue";

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: "/",
      name: "welcome",
      component: WorkspaceLayout
    },
    {
      path: "/:projectId/:branch/thread/:threadId",
      name: "thread",
      component: WorkspaceLayout
    },
    {
      path: "/:projectId/:branch/git",
      name: "git",
      component: WorkspaceLayout
    },
    {
      path: "/:projectId/:branch/files",
      name: "files",
      component: WorkspaceLayout
    },
    {
      path: "/:projectId/:branch/files/:filename+",
      name: "file",
      component: WorkspaceLayout
    }
  ]
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | head -20
```

Expected: no errors mentioning `router/index.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/router/index.ts
git commit -m "feat(router): define memory-history routes for workspace panels"
```

---

## Task 4: Wire router into main.ts and App.vue

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/App.vue`

- [ ] **Step 1: Update main.ts**

Open `apps/desktop/src/main.ts`. The current file:
```ts
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initColorSchemeFromStorage } from "./composables/useColorScheme";
import { initUiThemePresetFromStorage } from "./composables/useUiThemePreset";
import "./styles/globals.css";

initColorSchemeFromStorage();
initUiThemePresetFromStorage();

window.addEventListener("dragover", (e) => { e.preventDefault(); });
window.addEventListener("drop", (e) => { e.preventDefault(); });

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
```

Replace with:
```ts
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initColorSchemeFromStorage } from "./composables/useColorScheme";
import { initUiThemePresetFromStorage } from "./composables/useUiThemePreset";
import { router } from "./router/index";
import "./styles/globals.css";

initColorSchemeFromStorage();
initUiThemePresetFromStorage();

window.addEventListener("dragover", (e) => { e.preventDefault(); });
window.addEventListener("drop", (e) => { e.preventDefault(); });

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
```

- [ ] **Step 2: Update App.vue**

Read `apps/desktop/src/App.vue` and confirm current content (it should be a thin wrapper around `WorkspaceLayout`). Replace entirely with:

```vue
<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main.ts apps/desktop/src/App.vue
git commit -m "feat(router): wire vue-router into app entry point"
```

---

## Task 5: Create useActiveWorkspace composable

**Files:**
- Create: `apps/desktop/src/composables/useActiveWorkspace.ts`

This composable derives all "active" entity references from `useRoute()` + the store's data arrays. Components replace `workspace.activeProjectId`, `workspace.activeThreadId`, etc. with this composable.

- [ ] **Step 1: Create the composable**

Create `apps/desktop/src/composables/useActiveWorkspace.ts`:

```ts
import { computed } from "vue";
import { useRoute } from "vue-router";
import { decodeBranch } from "@/router/branchParam";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Thread, Worktree } from "@shared/domain";

function compareThreadSort(a: Thread, b: Thread): number {
  const byCreated = b.createdAt.localeCompare(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

export function useActiveWorkspace() {
  const route = useRoute();
  const workspace = useWorkspaceStore();

  const activeProjectId = computed<string | null>(() => {
    const id = route.params.projectId;
    return typeof id === "string" && id.length > 0 ? id : null;
  });

  const activeProject = computed(() =>
    workspace.projects.find((p) => p.id === activeProjectId.value)
  );

  const activeBranch = computed<string | null>(() => {
    const b = route.params.branch;
    return typeof b === "string" && b.length > 0 ? decodeBranch(b) : null;
  });

  const activeWorktree = computed<Worktree | undefined>(() =>
    workspace.worktrees.find(
      (w) => w.projectId === activeProjectId.value && w.branch === activeBranch.value
    )
  );

  const activeWorktreeId = computed<string | null>(() => activeWorktree.value?.id ?? null);

  const activeThreadId = computed<string | null>(() => {
    const id = route.params.threadId;
    return typeof id === "string" && id.length > 0 ? id : null;
  });

  const activeThread = computed(() =>
    workspace.threads.find((t) => t.id === activeThreadId.value)
  );

  const activeThreads = computed<Thread[]>(() => {
    if (!activeWorktreeId.value) return [];
    return workspace.threads
      .filter((t) => t.worktreeId === activeWorktreeId.value)
      .sort(compareThreadSort);
  });

  const defaultWorktree = computed<Worktree | undefined>(() =>
    workspace.worktrees.find(
      (w) => w.projectId === activeProjectId.value && w.isDefault
    )
  );

  const threadGroups = computed<Worktree[]>(() => {
    if (!activeProjectId.value) return [];
    return workspace.worktrees.filter(
      (w) => w.projectId === activeProjectId.value && !w.isDefault
    );
  });

  const hasActiveWorkspace = computed<boolean>(() =>
    Boolean(activeProjectId.value && activeWorktree.value?.path)
  );

  return {
    activeProjectId,
    activeProject,
    activeBranch,
    activeWorktree,
    activeWorktreeId,
    activeThreadId,
    activeThread,
    activeThreads,
    defaultWorktree,
    threadGroups,
    hasActiveWorkspace,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep useActiveWorkspace
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/composables/useActiveWorkspace.ts
git commit -m "feat(router): add useActiveWorkspace composable"
```

---

## Task 6: Update workspaceStore — remove active* state

**Files:**
- Modify: `apps/desktop/src/stores/workspaceStore.ts`

Remove `activeProjectId`, `activeWorktreeId`, `activeThreadId` from state. Remove getters that depended on them (`activeProject`, `activeWorktree`, `activeThreads`, `activeContextBadge`, `defaultWorktree`, `threadGroups`, `threadContexts`, `ungroupedThreads`, `groupedThreadsByWorktree`, `activeProjectThreads`). Update `hydrate()` to return active IDs instead of storing them. Simplify `removeThreadLocal()`.

- [ ] **Step 1: Read the current store file**

Read `apps/desktop/src/stores/workspaceStore.ts` in full before editing.

- [ ] **Step 2: Remove active state from the state() definition**

Find:
```ts
  state: () => ({
    projects: [] as Project[],
    worktrees: [] as Worktree[],
    threads: [] as Thread[],
    threadSessions: [] as ThreadSession[],
    activeProjectId: null as string | null,
    activeWorktreeId: null as string | null,
    activeThreadId: null as string | null
  }),
```

Replace with:
```ts
  state: () => ({
    projects: [] as Project[],
    worktrees: [] as Worktree[],
    threads: [] as Thread[],
    threadSessions: [] as ThreadSession[]
  }),
```

- [ ] **Step 3: Remove the dependent getters**

Remove these getter entries entirely (they are now in `useActiveWorkspace`):
- `activeProject`
- `activeWorktree`
- `activeThreads`
- `activeContextBadge`
- `defaultWorktree`
- `threadGroups`
- `threadContexts`
- `ungroupedThreads`
- `groupedThreadsByWorktree`
- `activeProjectThreads`

Keep only: `threadSessionFor`

- [ ] **Step 4: Update hydrate() to return active IDs**

Find the `hydrate` action:
```ts
    hydrate(snapshot: {
      projects: Project[];
      worktrees: Worktree[];
      threads: Thread[];
      threadSessions: ThreadSession[];
      activeProjectId: string | null;
      activeWorktreeId: string | null;
      activeThreadId: string | null;
    }) {
      this.projects = snapshot.projects;
      this.worktrees = snapshot.worktrees;
      this.threads = snapshot.threads;
      this.threadSessions = snapshot.threadSessions ?? [];
      this.activeProjectId = snapshot.activeProjectId;
      this.activeWorktreeId = snapshot.activeWorktreeId;
      this.activeThreadId = snapshot.activeThreadId;
    },
```

Replace with:
```ts
    hydrate(snapshot: {
      projects: Project[];
      worktrees: Worktree[];
      threads: Thread[];
      threadSessions: ThreadSession[];
      activeProjectId: string | null;
      activeWorktreeId: string | null;
      activeThreadId: string | null;
    }): { activeProjectId: string | null; activeWorktreeId: string | null; activeThreadId: string | null } {
      this.projects = snapshot.projects;
      this.worktrees = snapshot.worktrees;
      this.threads = snapshot.threads;
      this.threadSessions = snapshot.threadSessions ?? [];
      return {
        activeProjectId: snapshot.activeProjectId,
        activeWorktreeId: snapshot.activeWorktreeId,
        activeThreadId: snapshot.activeThreadId,
      };
    },
```

- [ ] **Step 5: Simplify removeThreadLocal()**

Find:
```ts
    removeThreadLocal(threadId: string): void {
      const wasActive = this.activeThreadId === threadId;
      this.threads = this.threads.filter((t) => t.id !== threadId);
      if (wasActive && this.activeWorktreeId) {
        this.activeThreadId =
          threadsForWorktree(this.threads, this.activeWorktreeId)[0]?.id ?? null;
      }
    }
```

Replace with:
```ts
    removeThreadLocal(threadId: string): void {
      this.threads = this.threads.filter((t) => t.id !== threadId);
    },
```

- [ ] **Step 6: Remove setActiveThread() action**

Delete:
```ts
    setActiveThread(threadId: string): void {
      this.activeThreadId = threadId;
    },
```

- [ ] **Step 7: Clean up helper functions no longer needed by the store**

At the top of the file, remove `buildThreadContexts`, `getActiveProjectWorktrees`, `orderProjectWorktrees`, and `worktreeDisplayLabel` only if they are no longer called from any remaining getter. Keep `threadsForWorktree` and `compareThreadSort` as they may still be used elsewhere. Keep all exported functions (`worktreeBranchNameContextLabel`).

- [ ] **Step 8: Run typecheck — expect errors in WorkspaceLayout (to be fixed in Task 7)**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep -c "error TS"
```

Note the count — these will all be fixed in Task 7. Do NOT fix them here.

- [ ] **Step 9: Commit with a note that WorkspaceLayout is temporarily broken**

```bash
git add apps/desktop/src/stores/workspaceStore.ts
git commit -m "refactor(store): remove active* state refs — WorkspaceLayout updated in next commit"
```

---

## Task 7: Update WorkspaceLayout — replace active* state with composable

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

This is the largest task. Replace all `workspace.activeProjectId`, `workspace.activeWorktreeId`, `workspace.activeThreadId`, `workspace.activeProject`, `workspace.activeWorktree`, `workspace.activeThreads`, `workspace.defaultWorktree`, `workspace.threadGroups` with the `useActiveWorkspace()` composable. Replace `mainCenterTab` ref with a route-derived computed.

- [ ] **Step 1: Add imports at the top of the script setup block**

Find the existing imports in `WorkspaceLayout.vue` and add:

```ts
import { useRoute, useRouter } from "vue-router";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { encodeBranch } from "@/router/branchParam";
```

- [ ] **Step 2: Initialize composables near the top of the script setup block**

After existing composable initializations (after `const scm = useScmStore();`), add:

```ts
const route = useRoute();
const router = useRouter();
const active = useActiveWorkspace();
```

- [ ] **Step 3: Replace mainCenterTab ref with a route-derived computed**

Find:
```ts
const mainCenterTab = ref<"agent" | "diff" | "files" | "preview">("agent");
```

Replace with:
```ts
const mainCenterTab = computed<"agent" | "diff" | "files" | "preview">(() => {
  const name = route.name;
  if (name === "git") return "diff";
  if (name === "files" || name === "file") return "files";
  if (name === "preview") return "preview";
  return "agent";
});
```

**Note:** All places that previously wrote `mainCenterTab.value = "xxx"` must now call `router.push(...)` instead. Find all such lines (`mainCenterTab.value = `) and replace them one by one using the routing helper below. For each such line, use the active params:

```ts
// Navigate to agent/thread panel:
await router.push({ name: "thread", params: { projectId: active.activeProjectId.value!, branch: encodeBranch(active.activeBranch.value!), threadId: active.activeThreadId.value! } });

// Navigate to git panel:
await router.push({ name: "git", params: { projectId: active.activeProjectId.value!, branch: encodeBranch(active.activeBranch.value!) } });

// Navigate to files panel:
await router.push({ name: "files", params: { projectId: active.activeProjectId.value!, branch: encodeBranch(active.activeBranch.value!) } });
```

There are also cases where `mainCenterTab.value = "agent"` is set but a `router.push` for the thread is called right after — in those cases, remove the `mainCenterTab.value = "agent"` line (the push will handle it).

- [ ] **Step 4: Replace workspace.active* references**

Do a search-replace throughout `WorkspaceLayout.vue`:

| Find | Replace |
|---|---|
| `workspace.activeProjectId` | `active.activeProjectId.value` |
| `workspace.activeWorktreeId` | `active.activeWorktreeId.value` |
| `workspace.activeThreadId` | `active.activeThreadId.value` |
| `workspace.activeProject` | `active.activeProject.value` |
| `workspace.activeWorktree` | `active.activeWorktree.value` |
| `workspace.activeThreads` | `active.activeThreads.value` |
| `workspace.defaultWorktree` | `active.defaultWorktree.value` |
| `workspace.threadGroups` | `active.threadGroups.value` |

In the template (HTML section), use `active.activeProjectId` etc. (Vue templates auto-unwrap `.value` for refs/computeds accessed on `const active` — but since `active` is a plain object of computeds, NOT a reactive object, you must access `.value` explicitly in `<script>` and use the computed directly in template by passing the values as variables):

Add these at the end of the script setup block, before the closing `</script>` for cleaner template access:

```ts
const activeProjectId = active.activeProjectId;
const activeWorktreeId = active.activeWorktreeId;
const activeThreadId = active.activeThreadId;
const activeProject = active.activeProject;
const activeWorktree = active.activeWorktree;
const activeThreads = active.activeThreads;
const defaultWorktree = active.defaultWorktree;
const threadGroups = active.threadGroups;
const hasActiveWorkspace = active.hasActiveWorkspace;
```

Then in the template, replace `workspace.activeProjectId` with `activeProjectId`, etc. (no `.value` in templates).

Remove the local `hasActiveWorkspace` computed if it was previously defined separately.

- [ ] **Step 5: Update initial route push on workspace hydrate**

In the `onMounted` or `onBeforeMount` lifecycle hook where `getSnapshot()` / `workspace.hydrate()` is called, capture the returned active IDs and push the initial route.

Find the existing hydrate call (it looks like `workspace.hydrate(snapshot)` somewhere in the `onMounted` / `onBeforeMount` or an IPC `onWorkspaceChanged` handler). Update to:

```ts
const initial = workspace.hydrate(snapshot);
if (initial.activeProjectId && initial.activeWorktreeId) {
  const worktree = workspace.worktrees.find((w) => w.id === initial.activeWorktreeId);
  if (worktree && initial.activeThreadId) {
    await router.push({
      name: "thread",
      params: {
        projectId: initial.activeProjectId,
        branch: encodeBranch(worktree.branch),
        threadId: initial.activeThreadId,
      },
    });
  } else if (worktree) {
    await router.push({
      name: "files",
      params: {
        projectId: initial.activeProjectId,
        branch: encodeBranch(worktree.branch),
      },
    });
  }
}
```

- [ ] **Step 6: Run typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | head -40
```

Fix any remaining type errors — they should all be in WorkspaceLayout.vue and relate to the replacements above.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "feat(router): replace mainCenterTab + workspace.active* with router in WorkspaceLayout"
```

---

## Task 8: Update WorkspaceLayout navigation functions

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

Replace `handleSelectThread`, `handleSelectProject`, `handleSelectWorktree` with `router.push()` calls. These functions currently call `api.setActive` IPC + store mutations. Preserve the IPC calls as side effects.

- [ ] **Step 1: Replace handleSelectThread**

Find `handleSelectThread` (around line 1093). It currently:
1. Sets `mainCenterTab.value = "agent"`
2. Calls `api.setActiveThread(threadId)` if same worktree
3. Calls `handleSelectWorktree` if cross-worktree

Replace with:

```ts
async function handleSelectThread(threadId: string): Promise<void> {
  const targetThread = workspace.threads.find((t) => t.id === threadId);
  if (!targetThread) return;

  const targetWt = workspace.worktrees.find((w) => w.id === targetThread.worktreeId);
  if (!targetWt) return;

  const projectId = targetThread.projectId;

  if (api.setActiveThread && targetThread.worktreeId === activeWorktreeId.value) {
    await api.setActiveThread(threadId);
  } else if (api.setActive) {
    await api.setActive({ projectId, worktreeId: targetWt.id, threadId });
  }

  await router.push({
    name: "thread",
    params: { projectId, branch: encodeBranch(targetWt.branch), threadId },
  });
}
```

- [ ] **Step 2: Replace handleSelectProject**

Find `handleSelectProject` (around line 706). It currently sets the project in IPC + store, then navigates to the first worktree's thread. Replace the function body to use router:

```ts
async function handleSelectProject(projectId: string): Promise<void> {
  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) return;

  const worktree =
    workspace.worktrees.find(
      (w) => w.projectId === projectId && w.id === project.lastActiveWorktreeId
    ) ?? workspace.worktrees.find((w) => w.projectId === projectId && w.isDefault);
  if (!worktree) return;

  const lastThreadId = worktree.lastActiveThreadId;
  const thread =
    (lastThreadId && workspace.threads.find((t) => t.id === lastThreadId)) ||
    workspace.threads.find((t) => t.worktreeId === worktree.id);

  if (api.setActive) {
    await api.setActive({ projectId, worktreeId: worktree.id, threadId: thread?.id ?? null });
  }

  if (thread) {
    await router.push({
      name: "thread",
      params: { projectId, branch: encodeBranch(worktree.branch), threadId: thread.id },
    });
  } else {
    await router.push({
      name: "files",
      params: { projectId, branch: encodeBranch(worktree.branch) },
    });
  }
}
```

- [ ] **Step 3: Replace handleSelectWorktree**

Find `handleSelectWorktree` (around line 736). Replace:

```ts
async function handleSelectWorktree(worktreeId: string): Promise<boolean> {
  const targetWt = workspace.worktrees.find((w) => w.id === worktreeId);
  if (!targetWt) return false;

  if (activeWorktreeId.value === targetWt.id) return true;

  const projectId = targetWt.projectId;
  const lastThreadId = targetWt.lastActiveThreadId;
  const thread =
    (lastThreadId && workspace.threads.find((t) => t.id === lastThreadId)) ||
    workspace.threads.find((t) => t.worktreeId === worktreeId);

  if (api.setActive) {
    await api.setActive({ projectId, worktreeId, threadId: thread?.id ?? null });
  }

  if (thread) {
    await router.push({
      name: "thread",
      params: { projectId, branch: encodeBranch(targetWt.branch), threadId: thread.id },
    });
  } else {
    await router.push({
      name: "files",
      params: { projectId, branch: encodeBranch(targetWt.branch) },
    });
  }
  return true;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | head -20
```

Expected: no errors (or only test file errors to be fixed in Task 12)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "feat(router): replace handleSelect* navigation with router.push()"
```

---

## Task 9: Update useThreadNavigation to use router.push

**Files:**
- Modify: `apps/desktop/src/composables/useThreadNavigation.ts`

`goPrevThread` and `goNextThread` currently call `handleSelectThread` passed as a parameter. Replace with direct `router.push()`.

- [ ] **Step 1: Read the file**

Read `apps/desktop/src/composables/useThreadNavigation.ts` in full.

- [ ] **Step 2: Update the composable signature and implementation**

The current signature is:
```ts
export function useThreadNavigation(
  workspace: ReturnType<typeof useWorkspaceStore>,
  pendingAgentBootstrap: Ref<PendingAgentBootstrap | null>,
  handleSelectThread: (threadId: string) => void | Promise<void>
)
```

Replace the entire file with:

```ts
import { watch, type Ref } from "vue";
import { useRouter } from "vue-router";
import { threadAgentResumeCommand } from "@shared/threadAgentBootstrap";
import { isValidPersistedResumeId } from "@shared/resumeSessionId";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import type { useWorkspaceStore } from "@/stores/workspaceStore";
import type { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { encodeBranch } from "@/router/branchParam";

export function useThreadNavigation(
  workspace: ReturnType<typeof useWorkspaceStore>,
  active: ReturnType<typeof useActiveWorkspace>,
  pendingAgentBootstrap: Ref<PendingAgentBootstrap | null>
): {
  goPrevThread: () => void;
  goNextThread: () => void;
  maybeSetResumeBootstrap: (threadId: string | null) => void;
} {
  const router = useRouter();

  function maybeSetResumeBootstrap(threadId: string | null): void {
    if (!threadId) return;
    const thread = workspace.threads.find((t) => t.id === threadId);
    if (!thread) return;
    const session = workspace.threadSessionFor(threadId);
    if (
      !session?.resumeId ||
      session.status !== "resumable" ||
      !isValidPersistedResumeId(session.resumeId)
    ) return;
    if (pendingAgentBootstrap.value?.threadId === threadId) return;
    pendingAgentBootstrap.value = {
      threadId,
      command: threadAgentResumeCommand(thread.agent, session.resumeId),
      mode: "resume"
    };
  }

  watch(
    () => active.activeThreadId.value,
    (id) => {
      const pending = pendingAgentBootstrap.value;
      if (pending && id !== pending.threadId) pendingAgentBootstrap.value = null;
      maybeSetResumeBootstrap(id);
    }
  );

  function goPrevThread(): void {
    const threads = active.activeThreads.value;
    const cur = active.activeThreadId.value;
    if (threads.length === 0) return;
    const i = cur ? threads.findIndex((t) => t.id === cur) : 0;
    const prev = i <= 0 ? threads.length - 1 : i - 1;
    const t = threads[prev];
    if (!t) return;
    const wt = workspace.worktrees.find((w) => w.id === t.worktreeId);
    if (!wt) return;
    void router.push({ name: "thread", params: { projectId: t.projectId, branch: encodeBranch(wt.branch), threadId: t.id } });
  }

  function goNextThread(): void {
    const threads = active.activeThreads.value;
    const cur = active.activeThreadId.value;
    if (threads.length === 0) return;
    const i = cur ? threads.findIndex((t) => t.id === cur) : -1;
    const next = i < 0 || i >= threads.length - 1 ? 0 : i + 1;
    const t = threads[next];
    if (!t) return;
    const wt = workspace.worktrees.find((w) => w.id === t.worktreeId);
    if (!wt) return;
    void router.push({ name: "thread", params: { projectId: t.projectId, branch: encodeBranch(wt.branch), threadId: t.id } });
  }

  return { goPrevThread, goNextThread, maybeSetResumeBootstrap };
}
```

- [ ] **Step 3: Update the call site in WorkspaceLayout.vue**

Find where `useThreadNavigation` is called in `WorkspaceLayout.vue`:
```ts
const { goPrevThread, goNextThread, maybeSetResumeBootstrap } = useThreadNavigation(
  workspace,
  pendingAgentBootstrap,
  handleSelectThread
);
```

Replace with (note: `handleSelectThread` arg removed, `active` added):
```ts
const { goPrevThread, goNextThread, maybeSetResumeBootstrap } = useThreadNavigation(
  workspace,
  active,
  pendingAgentBootstrap
);
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/composables/useThreadNavigation.ts apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "feat(router): migrate useThreadNavigation to router.push"
```

---

## Task 10: Navigation guard + thread deletion watcher

**Files:**
- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

The guard validates route params on every navigation. The watcher handles thread deletion while active.

- [ ] **Step 1: Add the navigation guard to router/index.ts**

Open `apps/desktop/src/router/index.ts` and add after the `router` creation:

```ts
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { decodeBranch } from "./branchParam";

router.beforeEach((to) => {
  const projectId = to.params.projectId as string | undefined;
  const branch = to.params.branch as string | undefined;
  const threadId = to.params.threadId as string | undefined;

  if (!projectId) return true; // welcome route — always allowed

  const workspace = useWorkspaceStore();

  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) return "/"; // project no longer exists

  if (branch) {
    const decodedBranch = decodeBranch(branch);
    const worktree = workspace.worktrees.find(
      (w) => w.projectId === projectId && w.branch === decodedBranch
    );
    if (!worktree) {
      // Branch gone — redirect to primary worktree
      const primary = workspace.worktrees.find((w) => w.projectId === projectId && w.isDefault);
      if (!primary) return "/";
      const fallbackThread = workspace.threads.find((t) => t.worktreeId === primary.id);
      if (fallbackThread) {
        return { name: "thread", params: { projectId, branch: primary.branch, threadId: fallbackThread.id } };
      }
      return { name: "files", params: { projectId, branch: primary.branch } };
    }

    if (threadId) {
      const thread = workspace.threads.find((t) => t.id === threadId);
      if (!thread) {
        const fallback = workspace.threads.find((t) => t.worktreeId === worktree.id);
        if (fallback) {
          return { name: "thread", params: { projectId, branch, threadId: fallback.id } };
        }
        return { name: "files", params: { projectId, branch } };
      }
    }
  }

  return true;
});
```

- [ ] **Step 2: Add thread deletion redirect watcher in WorkspaceLayout**

In `WorkspaceLayout.vue`, add a watcher that redirects when the active thread is deleted:

```ts
watch(
  () => workspace.threads.map((t) => t.id).join(","),
  () => {
    const currentThreadId = activeThreadId.value;
    if (!currentThreadId) return;
    if (route.name !== "thread") return;
    const stillExists = workspace.threads.some((t) => t.id === currentThreadId);
    if (stillExists) return;

    const fallback = workspace.threads.find((t) => t.worktreeId === activeWorktreeId.value);
    if (fallback && activeProjectId.value && activeBranch.value) {
      void router.replace({
        name: "thread",
        params: { projectId: activeProjectId.value, branch: encodeBranch(activeBranch.value), threadId: fallback.id },
      });
    } else if (activeProjectId.value && activeBranch.value) {
      void router.replace({
        name: "files",
        params: { projectId: activeProjectId.value, branch: encodeBranch(activeBranch.value) },
      });
    }
  }
);
```

Add `activeBranch` to the destructured variables from `useActiveWorkspace`:
```ts
const activeBranch = active.activeBranch;
```

- [ ] **Step 3: Run tests**

```bash
cd apps/desktop && pnpm test 2>&1 | tail -20
```

Note any failures — test fixes are in Task 12.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/router/index.ts apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "feat(router): add navigation guard and thread deletion watcher"
```

---

## Task 11: Create test utils createTestRouter

**Files:**
- Create: `apps/desktop/src/test-utils/createTestRouter.ts`

All component tests that mount `WorkspaceLayout` need a router. This helper provides a pre-configured memory-history router.

- [ ] **Step 1: Create the helper**

Create `apps/desktop/src/test-utils/createTestRouter.ts`:

```ts
import { createMemoryHistory, createRouter, type RouteLocationRaw } from "vue-router";
import WorkspaceLayout from "@/layouts/WorkspaceLayout.vue";

export function createTestRouter(initialRoute: RouteLocationRaw = "/") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "welcome", component: WorkspaceLayout },
      { path: "/:projectId/:branch/thread/:threadId", name: "thread", component: WorkspaceLayout },
      { path: "/:projectId/:branch/git", name: "git", component: WorkspaceLayout },
      { path: "/:projectId/:branch/files", name: "files", component: WorkspaceLayout },
      { path: "/:projectId/:branch/files/:filename+", name: "file", component: WorkspaceLayout },
    ],
  });

  void router.push(initialRoute);
  return router;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep test-utils
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/test-utils/createTestRouter.ts
git commit -m "test: add createTestRouter helper for component tests"
```

---

## Task 12: Update WorkspaceLayout tests

**Files:**
- Modify: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

All `mount(WorkspaceLayout, ...)` calls need `{ plugins: [createPinia(), createTestRouter(...)] }`. Tests that previously relied on `workspace.activeThreadId` now assert on the route.

- [ ] **Step 1: Read the test file**

Read `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts` in full.

- [ ] **Step 2: Add import for createTestRouter**

At the top of the test file, add:

```ts
import { createTestRouter } from "@/test-utils/createTestRouter";
```

- [ ] **Step 3: Update every mount call to include the router**

Find all occurrences of:
```ts
const wrapper = mount(WorkspaceLayout, {
  global: {
    plugins: [createPinia()]
  }
});
```

Replace each with:
```ts
const wrapper = mount(WorkspaceLayout, {
  global: {
    plugins: [createPinia(), createTestRouter("/project-1/main/thread/thread-1")]
  }
});
```

Use the appropriate initial route for each test — tests that set up a snapshot with `activeProjectId: "project-1"`, `activeWorktreeId: "worktree-1"` (branch: `"main"`), `activeThreadId: "thread-1"` should start at `/project-1/main/thread/thread-1`.

For tests with no active project (empty workspace), use `"/"`.

- [ ] **Step 4: Update test assertions that checked workspace.activeThreadId**

Any assertion like:
```ts
expect(workspace.activeThreadId).toBe("thread-2");
```

Should become:
```ts
expect(wrapper.vm.$router.currentRoute.value.params.threadId).toBe("thread-2");
```

Or access via the router directly:
```ts
const { router } = wrapper.vm.$;
```

Since `createTestRouter` returns the router instance, you can also capture it:
```ts
const testRouter = createTestRouter("/project-1/main/thread/thread-1");
const wrapper = mount(WorkspaceLayout, {
  global: { plugins: [createPinia(), testRouter] }
});
// ...
expect(testRouter.currentRoute.value.params.threadId).toBe("thread-2");
```

Update each such assertion using this pattern.

- [ ] **Step 5: Run all tests**

```bash
cd apps/desktop && pnpm test 2>&1 | tail -30
```

Fix any remaining failures. Common issues:
- Components that call `useRoute()` without a router provider — add `createTestRouter()` to their test mounts
- Async navigation — add `await router.isReady()` or `await flushPromises()` after navigation triggers

- [ ] **Step 6: Run full typecheck**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "test: update WorkspaceLayout tests to use createTestRouter"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Routes defined ✓, memory history ✓, `mainCenterTab` removed ✓, `active*` store state removed ✓, `useActiveWorkspace` composable ✓, navigation guard ✓, thread deletion watcher ✓, `encodeBranch`/`decodeBranch` ✓, `createTestRouter` helper ✓
- [x] **No placeholders:** All steps have real code
- [x] **Type consistency:** `encodeBranch` used consistently throughout; `active.activeProjectId.value` vs template `activeProjectId` pattern documented in Task 7; `useActiveWorkspace` return type used in Task 9 matches Task 5 definition
- [x] **`hydrate()` return value** used in Task 7 Step 5 matches new signature from Task 6 Step 4
- [x] **`useThreadNavigation` signature** updated in Task 9 Step 3 matches new definition in Task 9 Step 2
