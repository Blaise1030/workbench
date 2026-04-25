# Trees File Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `FileTreeNode.vue`-based tree inside `FileSearchEditor.vue` with `@pierre/trees` (vanilla API), adding built-in git status decorations, in-tree drag-and-drop moves, and delegated fuzzy search.

**Architecture:** A `useFileTree` composable owns the vanilla `FileTree` instance lifecycle, maps `useScmStore.repoStatus` to trees' git status format, and handles drag-and-drop via a new `moveFile` IPC call. A new `FileExplorerPanel.vue` component provides the mount `<div>` and search `<input>`, then replaces the `<FileTreeNode>` recursive rendering inside `FileSearchEditor.vue`.

**Tech Stack:** `@pierre/trees` (vanilla), Vue 3, Pinia (`useScmStore`), Electron IPC, Vitest + `@vue/test-utils`

**Design spec:** `docs/superpowers/specs/2026-04-22-trees-file-explorer-design.md`

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/desktop/src/composables/useFileTree.ts` |
| Create | `apps/desktop/src/composables/__tests__/useFileTree.test.ts` |
| Create | `apps/desktop/src/components/FileExplorerPanel.vue` |
| Create | `apps/desktop/src/components/__tests__/FileExplorerPanel.test.ts` |
| Modify | `apps/desktop/electron/ipcChannels.ts` |
| Modify | `apps/desktop/electron/services/fileService.ts` |
| Modify | `apps/desktop/electron/mainApp.ts` |
| Modify | `apps/desktop/electron/preload.ts` |
| Modify | `apps/desktop/src/env.d.ts` |
| Modify | `apps/desktop/src/components/FileSearchEditor.vue` |
| Modify | `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts` |
| Delete | `apps/desktop/src/components/FileTreeNode.vue` |

---

## Task 1: Install `@pierre/trees`

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install the package**

```bash
cd apps/desktop && pnpm add @pierre/trees
```

Expected: `@pierre/trees` appears in `package.json` dependencies. No errors.

- [ ] **Step 2: Verify TypeScript can see the types**

```bash
cd apps/desktop && pnpm exec vue-tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to `@pierre/trees`. (Other pre-existing errors are fine.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "chore: install @pierre/trees"
```

---

## Task 2: Add `moveFile` IPC

`@pierre/trees` fires `onDropComplete` with the dragged paths and destination. We need an IPC call to actually rename the file on disk. This follows the exact pattern of `filesDelete` / `filesCreate` already in the codebase.

**Files:**
- Modify: `apps/desktop/electron/ipcChannels.ts`
- Modify: `apps/desktop/electron/services/fileService.ts`
- Modify: `apps/desktop/electron/mainApp.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/src/env.d.ts`

- [ ] **Step 1: Add the channel constant to `ipcChannels.ts`**

Find the block containing `filesDeleteFolder: "files:deleteFolder"` (around line 55) and add one line after it:

```typescript
filesMove: "files:move",
```

- [ ] **Step 2: Add `moveFile` to `fileService.ts`**

Find the `deleteFile` method (around line 495) and add `moveFile` immediately after it, following the same shape:

```typescript
async moveFile(root: string, from: string, to: string): Promise<void> {
  const absoluteFrom = path.join(root, from);
  const absoluteTo = path.join(root, to);
  await fs.rename(absoluteFrom, absoluteTo);
}
```

`fs` and `path` are already imported in `fileService.ts` — do not add new imports.

- [ ] **Step 3: Register the IPC handler in `mainApp.ts`**

Find the `ipcMain.handle(IPC_CHANNELS.filesDeleteFolder, ...)` block (around line 544) and add immediately after it:

```typescript
ipcMain.handle(
  IPC_CHANNELS.filesMove,
  async (_, payload: { cwd: string; from: string; to: string }) => {
    return fileService.moveFile(payload.cwd, payload.from, payload.to);
  }
);
```

- [ ] **Step 4: Bridge `moveFile` in `preload.ts`**

Find the `deleteFile` and `createFolder` lines in the `workspaceApi` object (around line 208–215) and add `moveFile` alongside them:

```typescript
moveFile: (cwd: string, from: string, to: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.filesMove, { cwd, from, to }),
```

Note: the preload uses an inline `IPC_CHANNELS`-like object with string literals (not the import). Add the string `"files:move"` directly in the preload's own channel map too (find where `"files:deleteFolder"` is defined in the preload's `IPC_CHANNELS` const and add `filesMove: "files:move"` there).

- [ ] **Step 5: Add `moveFile` to the `WorkspaceApi` interface in `env.d.ts`**

Find the `deleteFile` line in the `WorkspaceApi` interface and add `moveFile` nearby:

```typescript
moveFile?: (cwd: string, from: string, to: string) => Promise<void>;
```

- [ ] **Step 6: Verify the preload parity test still passes**

```bash
cd apps/desktop && pnpm test -- electron/__tests__/preloadIpcChannelsParity.test.ts
```

Expected: PASS. If it fails, you missed adding the `"files:move"` string literal inside the preload's own `IPC_CHANNELS` constant.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/ipcChannels.ts \
        apps/desktop/electron/services/fileService.ts \
        apps/desktop/electron/mainApp.ts \
        apps/desktop/electron/preload.ts \
        apps/desktop/src/env.d.ts
git commit -m "feat(ipc): add moveFile IPC channel for in-tree drag-and-drop"
```

---

## Task 3: Create `useFileTree` composable

This composable owns the `FileTree` instance lifecycle, maps `useScmStore.repoStatus` to trees' git status format, and exposes `setSearch`. It is a pure logic unit — no template, no DOM except the `containerRef` mount point.

**Files:**
- Create: `apps/desktop/src/composables/useFileTree.ts`
- Create: `apps/desktop/src/composables/__tests__/useFileTree.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/composables/__tests__/useFileTree.test.ts`:

```typescript
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFileTree, mapRepoStatusToGitStatus } from "../useFileTree";
import type { RepoStatusEntry } from "@/shared/ipc";

const mockTree = {
  render: vi.fn(),
  cleanUp: vi.fn(),
  setGitStatus: vi.fn(),
  setSearch: vi.fn(),
  resetPaths: vi.fn(),
  move: vi.fn(),
};
const MockFileTree = vi.fn(() => mockTree);

vi.mock("@pierre/trees", () => ({
  FileTree: MockFileTree,
  prepareFileTreeInput: vi.fn((p: string[]) => p),
}));

vi.mock("@/stores/scmStore", () => ({
  useScmStore: vi.fn(() => ({ repoStatus: [] })),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: vi.fn(() => ({ error: vi.fn() })),
}));

function makeWrapper(
  paths: string[] = [],
  onSelect = vi.fn(),
  onQueue = vi.fn()
) {
  const workspacePath = ref("/project");
  const pathsRef = ref(paths);
  return mount(
    defineComponent({
      setup() {
        const { containerRef, setSearch, selectedPath } = useFileTree(
          workspacePath,
          pathsRef,
          onSelect,
          onQueue
        );
        return () => h("div", { ref: containerRef });
      },
    }),
    { attachTo: document.body }
  );
}

describe("mapRepoStatusToGitStatus", () => {
  it("maps untracked entries to untracked status", () => {
    const entries: RepoStatusEntry[] = [
      {
        path: "new.ts",
        originalPath: null,
        stagedKind: null,
        unstagedKind: null,
        isUntracked: true,
        stagedLinesAdded: null,
        stagedLinesRemoved: null,
        unstagedLinesAdded: null,
        unstagedLinesRemoved: null,
      },
    ];
    expect(mapRepoStatusToGitStatus(entries)).toEqual([
      { path: "new.ts", status: "untracked" },
    ]);
  });

  it("maps unstaged modified to modified", () => {
    const entries: RepoStatusEntry[] = [
      {
        path: "src/App.vue",
        originalPath: null,
        stagedKind: null,
        unstagedKind: "modified",
        isUntracked: false,
        stagedLinesAdded: null,
        stagedLinesRemoved: null,
        unstagedLinesAdded: 3,
        unstagedLinesRemoved: 1,
      },
    ];
    expect(mapRepoStatusToGitStatus(entries)).toEqual([
      { path: "src/App.vue", status: "modified" },
    ]);
  });

  it("maps staged-only added to added", () => {
    const entries: RepoStatusEntry[] = [
      {
        path: "src/New.vue",
        originalPath: null,
        stagedKind: "added",
        unstagedKind: null,
        isUntracked: false,
        stagedLinesAdded: 10,
        stagedLinesRemoved: 0,
        unstagedLinesAdded: null,
        unstagedLinesRemoved: null,
      },
    ];
    expect(mapRepoStatusToGitStatus(entries)).toEqual([
      { path: "src/New.vue", status: "added" },
    ]);
  });

  it("returns empty array for clean entries", () => {
    expect(mapRepoStatusToGitStatus([])).toEqual([]);
  });
});

describe("useFileTree", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("calls render on mount with the container element", async () => {
    const wrapper = makeWrapper(["src/App.vue"]);
    await flushPromises();
    expect(mockTree.render).toHaveBeenCalledTimes(1);
    expect(mockTree.render).toHaveBeenCalledWith({
      fileTreeContainer: expect.any(HTMLElement),
    });
    wrapper.unmount();
  });

  it("calls cleanUp on unmount", async () => {
    const wrapper = makeWrapper();
    await flushPromises();
    wrapper.unmount();
    expect(mockTree.cleanUp).toHaveBeenCalledTimes(1);
  });

  it("calls setSearch on the tree instance", async () => {
    const workspacePath = ref("/project");
    const pathsRef = ref<string[]>([]);
    let capturedSetSearch: ((v: string) => void) | undefined;

    const wrapper = mount(
      defineComponent({
        setup() {
          const { containerRef, setSearch } = useFileTree(
            workspacePath,
            pathsRef,
            vi.fn(),
            vi.fn()
          );
          capturedSetSearch = setSearch;
          return () => h("div", { ref: containerRef });
        },
      }),
      { attachTo: document.body }
    );
    await flushPromises();
    capturedSetSearch!("App");
    expect(mockTree.setSearch).toHaveBeenCalledWith("App");
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/desktop && pnpm test -- composables/__tests__/useFileTree
```

Expected: FAIL — `useFileTree` and `mapRepoStatusToGitStatus` do not exist yet.

- [ ] **Step 3: Implement `useFileTree.ts`**

Create `apps/desktop/src/composables/useFileTree.ts`:

```typescript
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { Ref } from "vue";
import { FileTree, prepareFileTreeInput } from "@pierre/trees";
import { useScmStore } from "@/stores/scmStore";
import { useToast } from "@/composables/useToast";
import type { RepoStatusEntry } from "@/shared/ipc";

type GitStatusValue =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

export interface GitStatusItem {
  path: string;
  status: GitStatusValue;
}

export function mapRepoStatusToGitStatus(
  entries: RepoStatusEntry[]
): GitStatusItem[] {
  const result: GitStatusItem[] = [];
  for (const entry of entries) {
    if (entry.isUntracked) {
      result.push({ path: entry.path, status: "untracked" });
      continue;
    }
    const kind = entry.unstagedKind ?? entry.stagedKind;
    if (kind === "modified") result.push({ path: entry.path, status: "modified" });
    else if (kind === "added") result.push({ path: entry.path, status: "added" });
    else if (kind === "deleted") result.push({ path: entry.path, status: "deleted" });
    else if (kind === "renamed") result.push({ path: entry.path, status: "renamed" });
  }
  return result;
}

export function useFileTree(
  workspacePath: Ref<string>,
  paths: Ref<string[]>,
  onSelectFile: (path: string) => void,
  onQueueForAgent: (payload: { kind: "file" | "folder"; path: string }) => void
): {
  containerRef: Ref<HTMLDivElement | null>;
  setSearch: (value: string) => void;
  selectedPath: Ref<string | null>;
} {
  const containerRef = ref<HTMLDivElement | null>(null);
  const selectedPath = ref<string | null>(null);
  const scm = useScmStore();
  const toast = useToast();
  let tree: FileTree | null = null;

  function setSearch(value: string): void {
    tree?.setSearch(value);
  }

  onMounted(() => {
    if (!containerRef.value) return;
    tree = new FileTree({
      paths: prepareFileTreeInput(paths.value),
      gitStatus: mapRepoStatusToGitStatus(scm.repoStatus),
      fileTreeSearchMode: "hide-non-matches",
      onSelectionChange: (selectedPaths: readonly string[]) => {
        const path = selectedPaths[0] ?? null;
        selectedPath.value = path;
        if (path) onSelectFile(path);
      },
      dragAndDrop: {
        onDropComplete: async (event: {
          draggedPaths: string[];
          destination: { path: string };
        }) => {
          const api = window.workspaceApi;
          if (!api?.moveFile) return;
          const cwd = workspacePath.value;
          for (const from of event.draggedPaths) {
            const fileName = from.split("/").at(-1) ?? from;
            const to = `${event.destination.path}/${fileName}`;
            try {
              await api.moveFile(cwd, from, to);
              tree?.move(from, to);
            } catch {
              toast.error("Move failed", `Could not move ${from}`);
            }
          }
        },
      },
      composition: {
        contextMenu: {
          render: (item: { path: string; kind: "file" | "folder" }) => {
            const el = document.createElement("div");

            const openBtn = document.createElement("button");
            openBtn.dataset.testid = "ctx-open-file";
            openBtn.textContent = "Open file";
            openBtn.addEventListener("click", () => onSelectFile(item.path));

            const queueBtn = document.createElement("button");
            queueBtn.dataset.testid = "ctx-queue-file";
            queueBtn.textContent = "Queue for agent";
            queueBtn.addEventListener("click", () =>
              onQueueForAgent({ kind: item.kind, path: item.path })
            );

            el.appendChild(openBtn);
            el.appendChild(queueBtn);
            return el;
          },
        },
      },
    });

    tree.render({ fileTreeContainer: containerRef.value });
  });

  onUnmounted(() => {
    tree?.cleanUp();
    tree = null;
  });

  watch(
    () => scm.repoStatus,
    (status) => {
      tree?.setGitStatus(mapRepoStatusToGitStatus(status));
    }
  );

  watch(paths, (newPaths) => {
    tree?.resetPaths(newPaths);
  });

  return { containerRef, setSearch, selectedPath };
}
```

**Note:** `@pierre/trees` is in beta. If TypeScript complains about exact option shapes (`gitStatus`, `dragAndDrop.onDropComplete` event type, `composition.contextMenu.render` item type), consult the generated `.d.ts` in `node_modules/@pierre/trees` and adjust types to match. The logic stays the same.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && pnpm test -- composables/__tests__/useFileTree
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/composables/useFileTree.ts \
        apps/desktop/src/composables/__tests__/useFileTree.test.ts
git commit -m "feat: add useFileTree composable with git status mapping and search"
```

---

## Task 4: Create `FileExplorerPanel.vue`

This component is the mount surface. It calls `listFiles` IPC to get paths, renders a debounced search `<input>` and the trees mount `<div>`, and emits `selectFile` / `queueForAgent` to its parent.

**Files:**
- Create: `apps/desktop/src/components/FileExplorerPanel.vue`
- Create: `apps/desktop/src/components/__tests__/FileExplorerPanel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/components/__tests__/FileExplorerPanel.test.ts`:

```typescript
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import FileExplorerPanel from "../FileExplorerPanel.vue";

// Mock useFileTree — we test the composable separately
const mockSetSearch = vi.fn();
const mockContainerRef = { value: document.createElement("div") };
vi.mock("@/composables/useFileTree", () => ({
  useFileTree: vi.fn(() => ({
    containerRef: mockContainerRef,
    setSearch: mockSetSearch,
    selectedPath: { value: null },
  })),
}));

const listFiles = vi.fn();
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  listFiles.mockResolvedValue([]);
  window.workspaceApi = { listFiles } as unknown as typeof window.workspaceApi;
});

describe("FileExplorerPanel", () => {
  it("calls listFiles with worktreePath on mount", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/App.vue", size: 1, modifiedAt: 1 },
    ]);
    mount(FileExplorerPanel, { props: { worktreePath: "/project" } });
    await flushPromises();
    expect(listFiles).toHaveBeenCalledWith("/project");
  });

  it("renders the search input", async () => {
    const wrapper = mount(FileExplorerPanel, {
      props: { worktreePath: "/project" },
    });
    await flushPromises();
    expect(
      wrapper.find('[data-testid="file-explorer-search"]').exists()
    ).toBe(true);
  });

  it("calls setSearch after debounce when search input changes", async () => {
    vi.useFakeTimers();
    const wrapper = mount(FileExplorerPanel, {
      props: { worktreePath: "/project" },
    });
    await flushPromises();
    await wrapper
      .get('[data-testid="file-explorer-search"]')
      .setValue("App");
    await vi.advanceTimersByTimeAsync(160);
    expect(mockSetSearch).toHaveBeenCalledWith("App");
    vi.useRealTimers();
  });

  it("emits queueForAgent when the composable's onQueueForAgent is called", async () => {
    const { useFileTree } = await import("@/composables/useFileTree");
    let capturedOnQueue: ((p: { kind: "file" | "folder"; path: string }) => void) | undefined;
    (useFileTree as ReturnType<typeof vi.fn>).mockImplementation(
      (_wp, _paths, _onSelect, onQueue) => {
        capturedOnQueue = onQueue;
        return { containerRef: mockContainerRef, setSearch: mockSetSearch, selectedPath: { value: null } };
      }
    );
    const wrapper = mount(FileExplorerPanel, {
      props: { worktreePath: "/project" },
    });
    await flushPromises();
    capturedOnQueue!({ kind: "file", path: "src/App.vue" });
    expect(wrapper.emitted("queueForAgent")).toEqual([
      [{ kind: "file", path: "src/App.vue" }],
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/desktop && pnpm test -- components/__tests__/FileExplorerPanel
```

Expected: FAIL — `FileExplorerPanel.vue` does not exist.

- [ ] **Step 3: Implement `FileExplorerPanel.vue`**

Create `apps/desktop/src/components/FileExplorerPanel.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useFileTree } from "@/composables/useFileTree";

const props = defineProps<{
  worktreePath: string;
}>();

const emit = defineEmits<{
  selectFile: [path: string];
  queueForAgent: [payload: { kind: "file" | "folder"; path: string }];
}>();

const paths = ref<string[]>([]);
const searchValue = ref("");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFiles(): Promise<void> {
  const api = window.workspaceApi;
  if (!api || !props.worktreePath) return;
  const files = await api.listFiles(props.worktreePath);
  paths.value = files.map((f) => f.relativePath);
}

function onSearchInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  searchValue.value = value;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => setSearch(value), 150);
}

const { containerRef, setSearch } = useFileTree(
  ref(props.worktreePath),
  paths,
  (path) => emit("selectFile", path),
  (payload) => emit("queueForAgent", payload)
);

onMounted(loadFiles);
watch(() => props.worktreePath, loadFiles);
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-1">
      <input
        data-testid="file-explorer-search"
        :value="searchValue"
        type="text"
        placeholder="Search files…"
        class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @input="onSearchInput"
      />
    </div>
    <div ref="containerRef" class="min-h-0 flex-1 overflow-auto" />
  </div>
</template>
```

**Note on `containerRef`:** `useFileTree` returns `containerRef` which must be the same ref used on the template `<div>`. Ensure the `ref="containerRef"` in the template binds to the composable's returned ref, not a new one. Because `<script setup>` exposes composable returns to the template automatically, `ref="containerRef"` works correctly here.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && pnpm test -- components/__tests__/FileExplorerPanel
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/FileExplorerPanel.vue \
        apps/desktop/src/components/__tests__/FileExplorerPanel.test.ts
git commit -m "feat: add FileExplorerPanel component using @pierre/trees"
```

---

## Task 5: Wire `FileExplorerPanel` into `FileSearchEditor.vue` and clean up

Replace the `<FileTreeNode>` recursive rendering section and local search + tree-state logic with `<FileExplorerPanel>`. Keep Monaco editor tabs, file reading, and persistence in `FileSearchEditor.vue`. Then delete `FileTreeNode.vue`.

**Files:**
- Modify: `apps/desktop/src/components/FileSearchEditor.vue`
- Modify: `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts`
- Delete: `apps/desktop/src/components/FileTreeNode.vue`

- [ ] **Step 1: Remove `FileTreeNode` import and local tree state from `FileSearchEditor.vue`**

In `FileSearchEditor.vue` (`<script setup>` section), remove:
- `import FileTreeNode from "./FileTreeNode.vue"`
- The `expandedFolders` ref and `toggleFolder` function
- The local search debounce logic that filters the file tree (the `filteredTree` / `buildTree` / fuzzy match code — search keeps a copy in trees now)
- The `forceExpanded` ref used to expand all during search

Add at the top of `<script setup>`:
```typescript
import FileExplorerPanel from "./FileExplorerPanel.vue";
```

- [ ] **Step 2: Replace the tree template with `<FileExplorerPanel>`**

In the `<template>`, find the sidebar section that renders `<FileTreeNode>` (look for `data-testid="file-search-sidebar"` or similar wrapping div with the recursive tree). Replace its entire interior — the search `<input>` and `<FileTreeNode>` usage — with:

```vue
<FileExplorerPanel
  :worktree-path="worktreePath"
  @select-file="openFile"
  @queue-for-agent="handleQueueForAgent"
/>
```

Where `openFile` is the existing function at line ~1301 of `FileSearchEditor.vue`, and `handleQueueForAgent` is the existing handler that receives `{ kind, path }` from the old `FileTreeNode` `queueForAgent` emit.

- [ ] **Step 3: Update `FileSearchEditor.test.ts` to remove tree-specific tests**

The tests that interact with `[data-testid="file-search-input"]` for filtering, `[data-testid="folder-toggle-*"]`, and `[data-testid="file-node-*"]` all depended on `FileTreeNode`. They need to be replaced with tests that verify `FileExplorerPanel` receives the correct props and emits the correct events.

Add these mocks at the top of `FileSearchEditor.test.ts` (alongside existing mocks):

```typescript
vi.mock("@/components/FileExplorerPanel.vue", () => ({
  default: defineComponent({
    name: "FileExplorerPanel",
    props: { worktreePath: String },
    emits: ["selectFile", "queueForAgent"],
    template: '<div data-testid="file-explorer-panel" />'
  })
}));
```

Remove or update every test that calls `wrapper.get('[data-testid="file-node-*"]')`, `wrapper.get('[data-testid="folder-toggle-*"]')`, or `wrapper.get('[data-testid="file-search-input"]').setValue(...)` — these tested the old tree and no longer apply.

Add a replacement test:

```typescript
it("renders FileExplorerPanel with the worktree path", async () => {
  listFiles.mockResolvedValue([]);
  const wrapper = mount(FileSearchEditor, {
    props: { worktreePath: "/tmp/project" }
  });
  await flushPromises();
  const panel = wrapper.find('[data-testid="file-explorer-panel"]');
  expect(panel.exists()).toBe(true);
});
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/desktop && pnpm test
```

Expected: All PASS. If existing tests that mock `FileTreeNode` fail, check that the mock for `FileExplorerPanel` is in place and that removed composable state (`expandedFolders`, `filteredTree`) is not referenced elsewhere in `FileSearchEditor.vue`.

- [ ] **Step 5: Delete `FileTreeNode.vue`**

```bash
rm apps/desktop/src/components/FileTreeNode.vue
rm apps/desktop/src/components/__tests__/FileTreeNode.test.ts 2>/dev/null || true
```

- [ ] **Step 6: Run full test suite again to confirm no broken imports**

```bash
cd apps/desktop && pnpm test
```

Expected: All PASS. If any test imports `FileTreeNode` directly, remove that import.

- [ ] **Step 7: Commit**

```bash
git add -A apps/desktop/src/components/
git commit -m "feat: replace FileTreeNode tree with FileExplorerPanel (@pierre/trees)"
```

---

## Task 6: TypeScript and typecheck clean-up

- [ ] **Step 1: Run the full typecheck**

```bash
cd apps/desktop && pnpm exec vue-tsc --noEmit
```

Expected: Zero errors related to `useFileTree`, `FileExplorerPanel`, or `moveFile`. If `@pierre/trees` beta types differ from what's in `useFileTree.ts` (e.g., `onSelectionChange`, `dragAndDrop.onDropComplete` event shape, `composition.contextMenu.render` item type), open `node_modules/@pierre/trees/dist/index.d.ts` and adjust the types in `useFileTree.ts` to match. The logic does not change — only the type annotations.

- [ ] **Step 2: Commit typecheck fixes (if any)**

```bash
git add apps/desktop/src/composables/useFileTree.ts
git commit -m "fix(types): align useFileTree types with @pierre/trees beta API"
```

---

## Done

At this point:
- `FileTreeNode.vue` is deleted
- `FileSearchEditor.vue` renders `<FileExplorerPanel>` for its sidebar
- `FileExplorerPanel.vue` mounts `@pierre/trees` vanilla, with git status from `useScmStore`, in-tree drag-and-drop via `moveFile` IPC, and built-in fuzzy search
- All existing tests pass
