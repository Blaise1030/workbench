# Header add-project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned **+** control after the scrolling project tabs in `Layout.vue` that opens the native repo folder picker, adds the folder as a workspace project when valid, refreshes queries, navigates to the new project, and surfaces duplicate/cancel/errors per spec.

**Architecture:** Keep orchestration in a small composable so `Layout.vue` only wires the button and delegates to one async function. Pure path helpers live in a tiny `lib` module for unit tests without Vue. Reuse `useNavigateToProject()` + the existing `navigateToProject` wrapper in `Layout.vue` (invalidates `worktrees`, `projectPath`, `projectTabs`) after `addProject` resolves. User feedback for duplicate and IPC failures uses `useToast()` from `vue-sonner` (same stack as `useToast.ts`).

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, TanStack Query (`useQueryClient`), Vue Router, Electron preload `window.workspaceApi` (`pickRepoDirectory`, `getSnapshot`, `addProject`), Vitest, `@vue/test-utils`, Pinia `useWorkspaceStore` (optional hydrate after snapshot—`navigateToProject` hydrates again).

**Spec:** `apps/desktop/docs/superpowers/specs/2026-05-01-header-add-project-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/desktop/src/lib/repoPathUtils.ts` | Create | `normalizeRepoPathForCompare(p: string): string` (trim, strip trailing `/` and `\`); `displayNameFromRepoPath(p: string): string` (last segment after final `/` or `\`, empty-safe). |
| `apps/desktop/src/lib/__tests__/repoPathUtils.test.ts` | Create | Vitest coverage for normalization + basename edge cases (trailing slash, Windows separators). |
| `apps/desktop/src/composables/useAddProjectFromDirectoryPick.ts` | Create | Async `pickAndAddProject(): Promise<void>`: guard `workspaceApi`; `getSnapshot` → pick → duplicate check → `addProject` → resolve new `projectId` from returned snapshot → `onNavigate(projectId)` callback provided by caller **or** accept `navigateToProject` + `queryClient` from caller. Prefer **injecting** `navigateToProject: (id: string) => Promise<void>` from Layout so invalidation stays in one place. |
| `apps/desktop/src/composables/__tests__/useAddProjectFromDirectoryPick.test.ts` | Create | Mock `window.workspaceApi`, mock `useToast`, assert flows (success calls navigate with new id; cancel; duplicate; addProject throw). |
| `apps/desktop/src/layouts/Layout.vue` | Modify | Restructure header row: wrap tab `Button`s in inner `overflow-x-auto flex-1 min-w-0`; sibling `shrink-0` **+** `Button` (`data-testid="header-add-project"`, `aria-label="Add project"`). Import composable; `const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject })` where `navigateToProject` is the **existing** async wrapper that already invalidates queries. Disable **+** when `!window.workspaceApi?.pickRepoDirectory` or `!appContext.value.gitService` (match tab query `enabled`). |
| `apps/desktop/src/env.d.ts` | Modify (if needed) | Ensure `addProject` return type documented as `Promise<WorkspaceSnapshot>` if you tighten typings for the composable (optional). |

---

## Task 1: Path helpers + unit tests

**Files:**

- Create: `apps/desktop/src/lib/repoPathUtils.ts`
- Create: `apps/desktop/src/lib/__tests__/repoPathUtils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/src/lib/__tests__/repoPathUtils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { displayNameFromRepoPath, normalizeRepoPathForCompare } from "../repoPathUtils";

describe("normalizeRepoPathForCompare", () => {
  it("trims and removes trailing slashes", () => {
    expect(normalizeRepoPathForCompare("/foo/bar/")).toBe("/foo/bar");
    expect(normalizeRepoPathForCompare("/foo/bar\\")).toBe("/foo/bar");
  });

  it("does not strip interior segments", () => {
    expect(normalizeRepoPathForCompare("/foo/bar/baz")).toBe("/foo/bar/baz");
  });
});

describe("displayNameFromRepoPath", () => {
  it("returns last path segment", () => {
    expect(displayNameFromRepoPath("/Users/me/projects/instrument")).toBe("instrument");
  });

  it("handles Windows-style separators", () => {
    expect(displayNameFromRepoPath("C:\\dev\\app")).toBe("app");
  });
});
```

- [ ] **Step 2: Run tests (expect fail — module missing)**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm test -- --reporter=verbose src/lib/__tests__/repoPathUtils.test.ts
```

Expected: FAIL (cannot resolve `../repoPathUtils`).

- [ ] **Step 3: Implement `repoPathUtils.ts`**

```ts
/** Collapses trailing separators and outer whitespace for duplicate detection. */
export function normalizeRepoPathForCompare(raw: string): string {
  return raw.trim().replace(/[/\\]+$/, "");
}

/** Folder display name from an absolute repo path (last segment). */
export function displayNameFromRepoPath(raw: string): string {
  const t = normalizeRepoPathForCompare(raw);
  const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  const base = i >= 0 ? t.slice(i + 1) : t;
  return base.trim() || t;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm test -- --reporter=verbose src/lib/__tests__/repoPathUtils.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/blaisetiong/Developer/instrument && git add apps/desktop/src/lib/repoPathUtils.ts apps/desktop/src/lib/__tests__/repoPathUtils.test.ts && git commit -m "feat(desktop): repo path helpers for add-project flow"
```

---

## Task 2: Composable `useAddProjectFromDirectoryPick`

**Files:**

- Create: `apps/desktop/src/composables/useAddProjectFromDirectoryPick.ts`
- Create: `apps/desktop/src/composables/__tests__/useAddProjectFromDirectoryPick.test.ts`

**Contract**

- **Input:** `{ navigateToProject: (projectId: string) => Promise<void> }` — must be Layout’s wrapper so TanStack invalidation runs.
- **Behavior:**
  1. If `!window.workspaceApi?.getSnapshot || !pickRepoDirectory || !addProject`, return early (optional: toast “Workspace unavailable”).
  2. `const before = await workspaceApi.getSnapshot()`.
  3. `const picked = await workspaceApi.pickRepoDirectory()`; if `picked == null`, return.
  4. If `before.projects.some(p => normalizeRepoPathForCompare(p.repoPath) === normalizeRepoPathForCompare(picked))`, call `useToast().error("Already in workspace", "This folder is already in the workspace.")` and return.
  5. `const name = displayNameFromRepoPath(picked)`.
  6. `const after = await workspaceApi.addProject({ name, repoPath: picked })` — cast to `WorkspaceSnapshot` from `@shared/ipc`.
  7. Find `const added = after.projects.find(p => normalizeRepoPathForCompare(p.repoPath) === normalizeRepoPathForCompare(picked))`; if missing, toast error and return (defensive).
  8. `await navigateToProject(added.id)` (caller invalidates + router).
- **Errors:** `try/catch` around `addProject`; on failure `useToast().error("Could not add project", String(err))` or a short friendly message; do not partially navigate.

- [ ] **Step 1: Write composable tests with vi.stubGlobal / vi.mock**

Use `vitest` `vi.fn()` for `pickRepoDirectory`, `getSnapshot`, `addProject`, and assert `navigateToProject` called with expected id. Mock `useToast` similarly to `apps/desktop/src/composables/useToast.test.ts` (`vi.mock("vue-sonner", ...)` or mock `useToast` if you export a test double).

Minimal success case:

```ts
const navigateToProject = vi.fn().mockResolvedValue(undefined);
// stub window.workspaceApi with getSnapshot returning { projects: [] } then addProject returning { projects: [{ id: "p-new", repoPath: "/x/y", name: "y", ... }] }
```

- [ ] **Step 2: Run composable test file — RED**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm test -- --reporter=verbose src/composables/__tests__/useAddProjectFromDirectoryPick.test.ts
```

- [ ] **Step 3: Implement composable** (imports: `WorkspaceSnapshot` from `@shared/ipc`, helpers from `@/lib/repoPathUtils`, `useToast` from `@/composables/useToast`).

- [ ] **Step 4: Run tests — GREEN**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm test -- --reporter=verbose src/composables/__tests__/useAddProjectFromDirectoryPick.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/composables/useAddProjectFromDirectoryPick.ts apps/desktop/src/composables/__tests__/useAddProjectFromDirectoryPick.test.ts && git commit -m "feat(desktop): composable for add-project from directory picker"
```

---

## Task 3: `Layout.vue` header UI + wiring

**Files:**

- Modify: `apps/desktop/src/layouts/Layout.vue`

- [ ] **Step 1: Markup change**

Replace the single `flex min-w-0 flex-1 ... overflow-x-auto` div that wraps **only** the tab buttons with:

- Outer: `div.flex.min-w-0.flex-1.items-center.gap-1.min-w-0` (no overflow on outer).
- Inner: `div.flex.min-w-0.flex-1.items-center.gap-1.overflow-x-auto` containing the `v-for` project tab `Button`s unchanged.
- Sibling: `Button` **+** (`PlusIcon` already imported), `shrink-0`, `variant="outline"`, `size="icon-sm"`, `data-testid="header-add-project"`, `aria-label="Add project"`, `:disabled="!canAddProject"` where `canAddProject` is `computed(() => Boolean(appContext.value.gitService && window.workspaceApi?.pickRepoDirectory))` (avoid referencing `window` during SSR tests—use optional chaining only in template or computed guarded by `typeof window !== "undefined"` if tests break).

Wire `@click="onAddProjectClick"` → `void pickAndAddProject()`.

- [ ] **Step 2: Script wiring**

```ts
import { useAddProjectFromDirectoryPick } from "@/composables/useAddProjectFromDirectoryPick";

const { pickAndAddProject } = useAddProjectFromDirectoryPick({
  navigateToProject,
});
```

Ensure `navigateToProject` refers to the **existing** `async function navigateToProject` in `Layout.vue` (the one that calls `navigateToProjectCore` + invalidates queries)—do not bypass it.

- [ ] **Step 3: Manual verification**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm run dev:electron
```

- Pick **+** → native dialog opens.
- Cancel → no new tab.
- Choose new folder → new tab appears, app navigates to that project.
- Repeat same folder → duplicate toast, no second tab.

- [ ] **Step 4: Typecheck + full test suite**

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm run typecheck && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layouts/Layout.vue && git commit -m "feat(desktop): header add-project button"
```

---

## Verification checklist

- [ ] `pnpm run typecheck` (in `apps/desktop`) passes.
- [ ] `pnpm test` passes.
- [ ] **+** stays visible when many project tabs overflow (sibling of scroll area, not inside it).
- [ ] Duplicate `repoPath` blocked with error toast per spec.
- [ ] IPC failure shows error toast; no navigation.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-header-add-project.md`.

**1. Subagent-driven (recommended)** — Fresh subagent per task above; use **superpowers:subagent-driven-development** between tasks.

**2. Inline execution** — Run tasks in this session with **superpowers:executing-plans** and checkpoints after each task.

Which approach do you want for implementation?
