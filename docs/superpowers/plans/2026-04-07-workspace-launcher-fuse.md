# Workspace Launcher (Raycast-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global ⌘K/Ctrl+K launcher for fuzzy search across threads and files in the current workspace.

**Architecture:** Renderer-side Fuse.js indexes (threads, branch files, worktree files) with prefix parsing (`@wt` for worktree-only search). Modal component with keyboard navigation, reusing existing WorkspaceApi for data.

**Tech Stack:** Vue 3, Fuse.js, existing Electron IPC, Vitest

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/components/WorkspaceLauncherModal.vue` | Main modal component with search input, results list, keyboard nav |
| `src/components/__tests__/WorkspaceLauncherModal.test.ts` | Component tests for modal behavior |
| `src/lib/workspaceLauncher.ts` | Fuse index management, query parsing, search logic |
| `src/lib/__tests__/workspaceLauncher.test.ts` | Unit tests for search logic and prefix parsing |
| `src/keybindings/registry.ts` | Add ⌘K/Ctrl+K shortcut definition |
| `src/composables/useWorkspaceKeybindings.ts` | Wire launcher shortcut to modal open |
| `src/layouts/WorkspaceLayout.vue` | Host launcher modal, handle open/close state |
| `package.json` | Add fuse.js dependency |

---

### Task 1: Add Fuse.js Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add fuse.js dependency**

```bash
npm install fuse.js
```

- [ ] **Step 2: Verify installation**

Run: `npm list fuse.js`
Expected: Shows fuse.js version in dependency tree

- [ ] **Step 3: Commit dependency**

```bash
git add package.json package-lock.json
git commit -m "deps: add fuse.js for workspace launcher search"
```

---

### Task 2: Core Search Logic and Prefix Parser

**Files:**
- Create: `src/lib/workspaceLauncher.ts`
- Create: `src/lib/__tests__/workspaceLauncher.test.ts`

- [ ] **Step 1: Write failing tests for prefix parser**

```typescript
// src/lib/__tests__/workspaceLauncher.test.ts
import { describe, it, expect } from "vitest";
import { parseQuery } from "../workspaceLauncher";

describe("workspaceLauncher", () => {
  describe("parseQuery", () => {
    it("returns default scope for queries without prefix", () => {
      expect(parseQuery("hello")).toEqual({
        scope: "default",
        query: "hello"
      });
    });

    it("returns worktree scope for @wt prefix", () => {
      expect(parseQuery("@wt hello")).toEqual({
        scope: "worktree",
        query: "hello"
      });
    });

    it("handles @wt with single space", () => {
      expect(parseQuery("@wt hello world")).toEqual({
        scope: "worktree", 
        query: "hello world"
      });
    });

    it("handles @wt without space", () => {
      expect(parseQuery("@wthello")).toEqual({
        scope: "worktree",
        query: "hello"
      });
    });

    it("returns empty query for @wt only", () => {
      expect(parseQuery("@wt")).toEqual({
        scope: "worktree",
        query: ""
      });
    });

    it("returns empty query for @wt with space only", () => {
      expect(parseQuery("@wt ")).toEqual({
        scope: "worktree",
        query: ""
      });
    });

    it("is case sensitive - @WT should not match", () => {
      expect(parseQuery("@WT hello")).toEqual({
        scope: "default",
        query: "@WT hello"
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/workspaceLauncher.test.ts`
Expected: FAIL with "parseQuery not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/workspaceLauncher.ts
export type SearchScope = "default" | "worktree";

export interface ParsedQuery {
  scope: SearchScope;
  query: string;
}

export function parseQuery(input: string): ParsedQuery {
  if (input.startsWith("@wt")) {
    const remainder = input.slice(3);
    const query = remainder.startsWith(" ") ? remainder.slice(1) : remainder;
    return {
      scope: "worktree",
      query
    };
  }
  
  return {
    scope: "default",
    query: input
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/workspaceLauncher.test.ts`
Expected: PASS

- [ ] **Step 5: Add Fuse index types and basic structure**

```typescript
// Add to src/lib/workspaceLauncher.ts
import Fuse from "fuse.js";
import type { FileSummary } from "@shared/ipc";

export interface ThreadSearchItem {
  id: string;
  title: string;
  agent: string;
}

export interface FileSearchItem {
  relativePath: string;
  worktreeId?: string;
  worktreeName?: string;
}

export interface SearchResult {
  type: "thread" | "file";
  item: ThreadSearchItem | FileSearchItem;
  score: number;
}

export class WorkspaceLauncher {
  private fuseThreads: Fuse<ThreadSearchItem> | null = null;
  private fuseBranchFiles: Fuse<FileSearchItem> | null = null;
  private fuseWorktreeFiles: Fuse<FileSearchItem> | null = null;

  constructor() {
    // Initialize with empty indexes
    this.rebuildIndexes([], [], []);
  }

  rebuildIndexes(
    threads: ThreadSearchItem[],
    branchFiles: FileSearchItem[],
    worktreeFiles: FileSearchItem[]
  ): void {
    this.fuseThreads = new Fuse(threads, {
      keys: ["title"],
      threshold: 0.4,
      includeScore: true
    });

    this.fuseBranchFiles = new Fuse(branchFiles, {
      keys: ["relativePath"],
      threshold: 0.4,
      includeScore: true
    });

    this.fuseWorktreeFiles = new Fuse(worktreeFiles, {
      keys: ["relativePath"],
      threshold: 0.4,
      includeScore: true
    });
  }

  search(input: string, limit: number = 20): SearchResult[] {
    const parsed = parseQuery(input);
    
    if (parsed.scope === "worktree") {
      return this.searchWorktreeFiles(parsed.query, limit);
    }
    
    return this.searchDefault(parsed.query, limit);
  }

  private searchDefault(query: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    
    // Search threads (top 10)
    if (this.fuseThreads && query.trim()) {
      const threadResults = this.fuseThreads.search(query, { limit: 10 });
      results.push(...threadResults.map(result => ({
        type: "thread" as const,
        item: result.item,
        score: result.score || 0
      })));
    }
    
    // Search branch files (remaining slots)
    if (this.fuseBranchFiles && query.trim()) {
      const remainingSlots = Math.max(0, limit - results.length);
      const fileResults = this.fuseBranchFiles.search(query, { limit: remainingSlots });
      results.push(...fileResults.map(result => ({
        type: "file" as const,
        item: result.item,
        score: result.score || 0
      })));
    }
    
    return results;
  }

  private searchWorktreeFiles(query: string, limit: number): SearchResult[] {
    if (!this.fuseWorktreeFiles || !query.trim()) {
      return [];
    }
    
    const fileResults = this.fuseWorktreeFiles.search(query, { limit });
    return fileResults.map(result => ({
      type: "file" as const,
      item: result.item,
      score: result.score || 0
    }));
  }
}
```

- [ ] **Step 6: Add basic search tests**

```typescript
// Add to src/lib/__tests__/workspaceLauncher.test.ts
import { WorkspaceLauncher } from "../workspaceLauncher";

describe("WorkspaceLauncher", () => {
  it("searches threads in default mode", () => {
    const launcher = new WorkspaceLauncher();
    launcher.rebuildIndexes(
      [{ id: "1", title: "Fix bug in parser", agent: "claude" }],
      [],
      []
    );
    
    const results = launcher.search("parser");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("thread");
    expect(results[0].item).toEqual({
      id: "1",
      title: "Fix bug in parser", 
      agent: "claude"
    });
  });

  it("searches files in default mode", () => {
    const launcher = new WorkspaceLauncher();
    launcher.rebuildIndexes(
      [],
      [{ relativePath: "src/parser.ts" }],
      []
    );
    
    const results = launcher.search("parser");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("file");
    expect(results[0].item).toEqual({
      relativePath: "src/parser.ts"
    });
  });

  it("searches only worktree files with @wt prefix", () => {
    const launcher = new WorkspaceLauncher();
    launcher.rebuildIndexes(
      [{ id: "1", title: "parser work", agent: "claude" }],
      [{ relativePath: "src/parser.ts" }],
      [{ relativePath: "feature/parser.ts", worktreeId: "feature" }]
    );
    
    const results = launcher.search("@wt parser");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("file");
    expect(results[0].item).toEqual({
      relativePath: "feature/parser.ts",
      worktreeId: "feature"
    });
  });

  it("returns empty array for @wt with no query", () => {
    const launcher = new WorkspaceLauncher();
    launcher.rebuildIndexes([], [], [{ relativePath: "test.ts" }]);
    
    const results = launcher.search("@wt");
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run tests to verify implementation**

Run: `npm test -- src/lib/__tests__/workspaceLauncher.test.ts`
Expected: PASS

- [ ] **Step 8: Commit core search logic**

```bash
git add src/lib/workspaceLauncher.ts src/lib/__tests__/workspaceLauncher.test.ts
git commit -m "feat: add workspace launcher search logic with Fuse.js"
```

---

### Task 3: Add Launcher Keybinding

**Files:**
- Modify: `src/keybindings/registry.ts`

- [ ] **Step 1: Write test for new keybinding**

```typescript
// Add to existing test file or create new one
// This verifies the keybinding is registered correctly
import { KEYBINDING_DEFINITIONS, findDefinition } from "../registry";

// Add to existing describe block
it("includes workspace launcher keybinding", () => {
  const def = findDefinition("workspaceLauncher");
  expect(def).toBeDefined();
  expect(def?.shortcut).toEqual({
    mod: true,
    code: "KeyK"
  });
  expect(def?.category).toBe("Navigation");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/keybindings/__tests__/registry.test.ts` (or appropriate test file)
Expected: FAIL with "workspaceLauncher not found"

- [ ] **Step 3: Add keybinding definition**

```typescript
// In src/keybindings/registry.ts
// Add to KeybindingId type
export type KeybindingId =
  | "switchProjectOrTerminalDigit"
  | "prevThread"
  | "nextThread"
  | "toggleThreadSidebar"
  | "newThreadMenu"
  | "addTerminal"
  | "focusFileSearch"
  | "workspaceLauncher"  // Add this line
  | "stageAllDiff"
  | "openSettings";

// Add to KEYBINDING_DEFINITIONS array, after focusFileSearch
{
  id: "workspaceLauncher",
  label: "Open workspace launcher",
  category: "Navigation",
  shortcut: mod("KeyK")
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/keybindings/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit keybinding addition**

```bash
git add src/keybindings/registry.ts
git commit -m "feat: add ⌘K/Ctrl+K keybinding for workspace launcher"
```

---

### Task 4: Wire Keybinding to Layout

**Files:**
- Modify: `src/composables/useWorkspaceKeybindings.ts`
- Modify: `src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Add launcher handler to keybinding context type**

```typescript
// In src/composables/useWorkspaceKeybindings.ts
// Add to WorkspaceKeybindingContext interface
export type WorkspaceKeybindingContext = {
  /** Thread + worktree UI visible */
  workspaceUiActive: () => boolean;
  settingsOpen: () => boolean;
  centerTab: () => string;
  /** Project ids in tab order; first nine get ⌘1–⌘9. */
  projectIds: () => readonly string[];
  shellSlotIds: () => readonly string[];
  /** When false, stage-all shortcut on diff tab is ignored. */
  scmActionsAvailable: () => boolean;
  onSelectProject: (projectId: string) => void;
  onSelectCenterTab: (tab: string) => void;
  onPrevThread: () => void;
  onNextThread: () => void;
  onToggleSidebar: () => void;
  onOpenNewThreadMenu: () => void;
  onAddTerminal: () => void;
  onFocusFileSearch: () => void;
  onOpenWorkspaceLauncher: () => void;  // Add this line
  onStageAllDiff: () => void;
  onOpenSettings: () => void;
};
```

- [ ] **Step 2: Add keybinding handler in useWorkspaceKeybindings**

```typescript
// In src/composables/useWorkspaceKeybindings.ts
// Add to NAV_IDS array
const NAV_IDS: KeybindingId[] = [
  "prevThread",
  "nextThread", 
  "toggleThreadSidebar",
  "newThreadMenu",
  "addTerminal",
  "focusFileSearch",
  "workspaceLauncher",  // Add this line
  "stageAllDiff"
];

// Add handler in onKeydown function, after focusFileSearch
if (id === "workspaceLauncher") {
  if (!inTerminal && !typing) {
    ctx.onOpenWorkspaceLauncher();
    ev.preventDefault();
  }
  return;
}
```

- [ ] **Step 3: Add launcher state to WorkspaceLayout**

```vue
<!-- In src/layouts/WorkspaceLayout.vue -->
<!-- Add to script setup -->
const workspaceLauncherOpen = ref(false);

function handleOpenWorkspaceLauncher(): void {
  workspaceLauncherOpen.value = true;
}

// Add to keybinding context object
const keybindingContext: WorkspaceKeybindingContext = {
  workspaceUiActive: () => Boolean(snapshot.value?.activeWorktree),
  settingsOpen: () => agentCommandsSettingsOpen.value,
  centerTab: () => centerTab.value,
  projectIds: () => snapshot.value?.projects.map(p => p.id) ?? [],
  shellSlotIds,
  scmActionsAvailable: () => centerTab.value === "diff" && Boolean(snapshot.value?.activeWorktree),
  onSelectProject: handleSelectProject,
  onSelectCenterTab: handleSelectCenterTab,
  onPrevThread: handlePrevThread,
  onNextThread: handleNextThread,
  onToggleSidebar: handleToggleSidebar,
  onOpenNewThreadMenu: handleOpenNewThreadMenu,
  onAddTerminal: handleAddTerminal,
  onFocusFileSearch: focusFileSearchShortcut,
  onOpenWorkspaceLauncher: handleOpenWorkspaceLauncher,  // Add this line
  onStageAllDiff: handleStageAllDiff,
  onOpenSettings: handleConfigureCommands
};
```

- [ ] **Step 4: Test keybinding wiring manually**

Run: `npm run dev:electron`
Expected: ⌘K/Ctrl+K should trigger (will error until modal component exists)

- [ ] **Step 5: Commit keybinding wiring**

```bash
git add src/composables/useWorkspaceKeybindings.ts src/layouts/WorkspaceLayout.vue
git commit -m "feat: wire ⌘K shortcut to workspace launcher handler"
```

---

### Task 5: Basic Modal Component

**Files:**
- Create: `src/components/WorkspaceLauncherModal.vue`
- Create: `src/components/__tests__/WorkspaceLauncherModal.test.ts`

- [ ] **Step 1: Write failing test for modal component**

```typescript
// src/components/__tests__/WorkspaceLauncherModal.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceLauncherModal from "../WorkspaceLauncherModal.vue";

describe("WorkspaceLauncherModal", () => {
  let wrapper: ReturnType<typeof mount>;

  beforeEach(() => {
    // Mock WorkspaceApi
    global.window = {
      ...global.window,
      workspaceApi: {
        getSnapshot: vi.fn().mockResolvedValue({
          activeWorktree: { 
            id: "main",
            path: "/test/project",
            threads: [
              { id: "1", title: "Test thread", agent: "claude" }
            ]
          }
        }),
        listFiles: vi.fn().mockResolvedValue([
          { relativePath: "src/test.ts", size: 100, modifiedAt: Date.now() }
        ])
      }
    } as any;
  });

  it("renders search input when open", () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: true }
    });

    const input = wrapper.find('input[type="text"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes("placeholder")).toContain("Search");
  });

  it("does not render when closed", () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: false }
    });

    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  it("emits close on Escape key", async () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: true }
    });

    const input = wrapper.find('input[type="text"]');
    await input.trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("shows empty state for empty query", () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: true }
    });

    expect(wrapper.text()).toContain("Type to search");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/__tests__/WorkspaceLauncherModal.test.ts`
Expected: FAIL with "WorkspaceLauncherModal not found"

- [ ] **Step 3: Create minimal modal component**

```vue
<!-- src/components/WorkspaceLauncherModal.vue -->
<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { WorkspaceLauncher, type SearchResult } from "@/lib/workspaceLauncher";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  activate: [result: SearchResult];
}>();

const query = ref("");
const results = ref<SearchResult[]>([]);
const selectedIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const launcher = new WorkspaceLauncher();

// Focus input when modal opens
watch(() => props.open, async (open) => {
  if (open) {
    await nextTick();
    inputRef.value?.focus();
    query.value = "";
    results.value = [];
    selectedIndex.value = 0;
  }
});

// Search when query changes
watch(query, (newQuery) => {
  if (!newQuery.trim()) {
    results.value = [];
    selectedIndex.value = 0;
    return;
  }
  
  results.value = launcher.search(newQuery);
  selectedIndex.value = 0;
});

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    emit("close");
    return;
  }
  
  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1);
    return;
  }
  
  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
    return;
  }
  
  if (event.key === "Enter" && results.value[selectedIndex.value]) {
    event.preventDefault();
    emit("activate", results.value[selectedIndex.value]);
    return;
  }
}

function handleResultClick(index: number): void {
  emit("activate", results.value[index]);
}

// Global keydown handler for Escape when modal is open
function handleGlobalKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<template>
  <div v-if="open" class="workspace-launcher-modal">
    <div class="modal-backdrop" @click="emit('close')" />
    <div class="modal-content">
      <div class="search-container">
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="Search threads and files..."
          class="search-input"
          @keydown="handleKeydown"
        />
        <div class="search-hint">
          @wt — search worktrees
        </div>
      </div>
      
      <div class="results-container">
        <div v-if="!query.trim()" class="empty-state">
          Type to search threads and files in this workspace
        </div>
        
        <div v-else-if="results.length === 0" class="empty-state">
          No results found
        </div>
        
        <div v-else class="results-list">
          <div
            v-for="(result, index) in results"
            :key="`${result.type}-${index}`"
            :class="[
              'result-item',
              { 'selected': index === selectedIndex }
            ]"
            @click="handleResultClick(index)"
          >
            <div class="result-icon">
              {{ result.type === 'thread' ? '💬' : '📄' }}
            </div>
            <div class="result-content">
              <div class="result-title">
                {{ result.type === 'thread' 
                    ? (result.item as any).title 
                    : (result.item as any).relativePath }}
              </div>
              <div v-if="result.type === 'thread'" class="result-subtitle">
                {{ (result.item as any).agent }} thread
              </div>
              <div v-else-if="(result.item as any).worktreeName" class="result-subtitle">
                {{ (result.item as any).worktreeName }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-launcher-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
}

.modal-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  width: 600px;
  max-width: 90vw;
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.search-container {
  padding: 20px;
  border-bottom: 1px solid #e5e5e5;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 16px;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.search-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #6b7280;
}

.results-container {
  max-height: 400px;
  overflow-y: auto;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #6b7280;
}

.results-list {
  padding: 8px 0;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.result-item:hover,
.result-item.selected {
  background-color: #f3f4f6;
}

.result-icon {
  margin-right: 12px;
  font-size: 16px;
}

.result-content {
  flex: 1;
}

.result-title {
  font-weight: 500;
  color: #111827;
}

.result-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/__tests__/WorkspaceLauncherModal.test.ts`
Expected: PASS

- [ ] **Step 5: Add modal to WorkspaceLayout**

```vue
<!-- In src/layouts/WorkspaceLayout.vue -->
<!-- Add import -->
<script setup lang="ts">
// ... existing imports
import WorkspaceLauncherModal from "@/components/WorkspaceLauncherModal.vue";
// ... rest of script
</script>

<!-- Add modal at end of template, before closing div -->
<template>
  <!-- ... existing template content ... -->
  
  <WorkspaceLauncherModal 
    :open="workspaceLauncherOpen"
    @close="workspaceLauncherOpen = false"
    @activate="handleLauncherActivate"
  />
</template>
```

- [ ] **Step 6: Add activation handler stub**

```typescript
// In src/layouts/WorkspaceLayout.vue script setup
function handleLauncherActivate(result: SearchResult): void {
  workspaceLauncherOpen.value = false;
  
  if (result.type === "thread") {
    // TODO: Implement thread activation
    console.log("Activate thread:", result.item);
  } else {
    // TODO: Implement file activation  
    console.log("Activate file:", result.item);
  }
}
```

- [ ] **Step 7: Test modal opens with keybinding**

Run: `npm run dev:electron`
Test: Press ⌘K/Ctrl+K
Expected: Modal opens with search input focused

- [ ] **Step 8: Commit basic modal**

```bash
git add src/components/WorkspaceLauncherModal.vue src/components/__tests__/WorkspaceLauncherModal.test.ts src/layouts/WorkspaceLayout.vue
git commit -m "feat: add basic workspace launcher modal with keyboard nav"
```

---

### Task 6: Connect Real Data Sources

**Files:**
- Modify: `src/components/WorkspaceLauncherModal.vue`
- Modify: `src/lib/workspaceLauncher.ts`

- [ ] **Step 1: Add data loading to WorkspaceLauncher class**

```typescript
// Add to src/lib/workspaceLauncher.ts
export interface WorkspaceSnapshot {
  activeWorktree?: {
    id: string;
    path: string;
    threads: Array<{
      id: string;
      title: string;
      agent: string;
    }>;
  };
  worktrees?: Array<{
    id: string;
    path: string;
    name: string;
  }>;
}

export class WorkspaceLauncher {
  // ... existing code ...

  async loadWorkspaceData(): Promise<void> {
    const api = window.workspaceApi;
    if (!api) return;

    try {
      // Load workspace snapshot for threads
      const snapshot = await api.getSnapshot() as WorkspaceSnapshot;
      const threads: ThreadSearchItem[] = snapshot.activeWorktree?.threads.map(t => ({
        id: t.id,
        title: t.title,
        agent: t.agent
      })) ?? [];

      // Load files from active worktree
      let branchFiles: FileSearchItem[] = [];
      if (snapshot.activeWorktree?.path) {
        const files = await api.listFiles(snapshot.activeWorktree.path);
        branchFiles = files.map(f => ({
          relativePath: f.relativePath
        }));
      }

      // Load worktree files (simplified for now)
      const worktreeFiles: FileSearchItem[] = [];
      // TODO: Implement worktree file loading

      this.rebuildIndexes(threads, branchFiles, worktreeFiles);
    } catch (error) {
      console.error("Failed to load workspace data:", error);
    }
  }
}
```

- [ ] **Step 2: Load data when modal opens**

```vue
<!-- In src/components/WorkspaceLauncherModal.vue -->
<script setup lang="ts">
// ... existing imports and setup ...

// Load data when modal opens
watch(() => props.open, async (open) => {
  if (open) {
    await nextTick();
    inputRef.value?.focus();
    query.value = "";
    results.value = [];
    selectedIndex.value = 0;
    
    // Load fresh data
    await launcher.loadWorkspaceData();
  }
});

// ... rest of component
</script>
```

- [ ] **Step 3: Add type safety for window.workspaceApi**

```typescript
// Add to src/lib/workspaceLauncher.ts
declare global {
  interface Window {
    workspaceApi?: {
      getSnapshot(): Promise<any>;
      listFiles(cwd: string): Promise<Array<{ relativePath: string }>>;
    };
  }
}
```

- [ ] **Step 4: Test with real data**

Run: `npm run dev:electron`
Test: Open a project, create a thread, press ⌘K, type thread name
Expected: Thread appears in search results

- [ ] **Step 5: Commit data integration**

```bash
git add src/components/WorkspaceLauncherModal.vue src/lib/workspaceLauncher.ts
git commit -m "feat: connect launcher to real workspace data"
```

---

### Task 7: Implement Result Activation

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Import SearchResult type**

```typescript
// In src/layouts/WorkspaceLayout.vue
import type { SearchResult } from "@/lib/workspaceLauncher";
```

- [ ] **Step 2: Implement thread activation**

```typescript
// Replace handleLauncherActivate in src/layouts/WorkspaceLayout.vue
function handleLauncherActivate(result: SearchResult): void {
  workspaceLauncherOpen.value = false;
  
  if (result.type === "thread") {
    const threadItem = result.item as any;
    // Use existing thread activation logic
    const api = getApi();
    if (api) {
      api.setActiveThread(threadItem.id);
    }
  } else {
    const fileItem = result.item as any;
    // Switch to Files tab and open file
    centerTab.value = "files";
    
    // TODO: Need to trigger file selection in FileSearchEditor
    // For now, just switch to files tab
    console.log("Opening file:", fileItem.relativePath);
  }
}
```

- [ ] **Step 3: Test thread activation**

Run: `npm run dev:electron`
Test: Create threads, use launcher to search and select thread
Expected: Thread becomes active in sidebar

- [ ] **Step 4: Add file activation (basic)**

```typescript
// Enhanced file activation in handleLauncherActivate
if (result.type === "file") {
  const fileItem = result.item as any;
  centerTab.value = "files";
  
  // Store selected file for FileSearchEditor to pick up
  nextTick(() => {
    // This is a simplified approach - in real implementation
    // we'd need to coordinate with FileSearchEditor component
    const event = new CustomEvent("launcher-select-file", {
      detail: { relativePath: fileItem.relativePath }
    });
    window.dispatchEvent(event);
  });
}
```

- [ ] **Step 5: Test basic activation**

Run: `npm run dev:electron`
Test: Search for files, select one
Expected: Switches to Files tab (file opening can be improved later)

- [ ] **Step 6: Commit activation logic**

```bash
git add src/layouts/WorkspaceLayout.vue
git commit -m "feat: implement thread and basic file activation from launcher"
```

---

### Task 8: Add Comprehensive Tests

**Files:**
- Modify: `src/lib/__tests__/workspaceLauncher.test.ts`
- Modify: `src/components/__tests__/WorkspaceLauncherModal.test.ts`

- [ ] **Step 1: Add edge case tests for parser**

```typescript
// Add to src/lib/__tests__/workspaceLauncher.test.ts
describe("parseQuery edge cases", () => {
  it("handles multiple @wt in query", () => {
    expect(parseQuery("@wt search @wt again")).toEqual({
      scope: "worktree",
      query: "search @wt again"
    });
  });

  it("handles @wt in middle of query", () => {
    expect(parseQuery("hello @wt world")).toEqual({
      scope: "default", 
      query: "hello @wt world"
    });
  });

  it("handles empty input", () => {
    expect(parseQuery("")).toEqual({
      scope: "default",
      query: ""
    });
  });

  it("handles whitespace only", () => {
    expect(parseQuery("   ")).toEqual({
      scope: "default",
      query: "   "
    });
  });
});
```

- [ ] **Step 2: Add search ranking tests**

```typescript
// Add to src/lib/__tests__/workspaceLauncher.test.ts
describe("search ranking", () => {
  it("ranks exact matches higher than partial", () => {
    const launcher = new WorkspaceLauncher();
    launcher.rebuildIndexes(
      [
        { id: "1", title: "test", agent: "claude" },
        { id: "2", title: "testing something", agent: "claude" }
      ],
      [],
      []
    );
    
    const results = launcher.search("test");
    expect(results[0].item).toEqual({
      id: "1", 
      title: "test",
      agent: "claude"
    });
  });

  it("limits results to specified count", () => {
    const launcher = new WorkspaceLauncher();
    const threads = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      title: `test ${i}`,
      agent: "claude"
    }));
    launcher.rebuildIndexes(threads, [], []);
    
    const results = launcher.search("test", 5);
    expect(results).toHaveLength(5);
  });

  it("combines thread and file results in default mode", () => {
    const launcher = new WorkspaceLauncher();
    launcher.rebuildIndexes(
      [{ id: "1", title: "parser", agent: "claude" }],
      [{ relativePath: "parser.ts" }],
      []
    );
    
    const results = launcher.search("parser");
    expect(results).toHaveLength(2);
    expect(results.map(r => r.type)).toEqual(["thread", "file"]);
  });
});
```

- [ ] **Step 3: Add modal interaction tests**

```typescript
// Add to src/components/__tests__/WorkspaceLauncherModal.test.ts
describe("keyboard navigation", () => {
  beforeEach(() => {
    // Mock launcher with results
    vi.doMock("@/lib/workspaceLauncher", () => ({
      WorkspaceLauncher: vi.fn().mockImplementation(() => ({
        loadWorkspaceData: vi.fn(),
        search: vi.fn().mockReturnValue([
          { type: "thread", item: { id: "1", title: "Test 1" }, score: 0.1 },
          { type: "file", item: { relativePath: "test.ts" }, score: 0.2 }
        ])
      }))
    }));
  });

  it("navigates down with arrow key", async () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: true }
    });

    const input = wrapper.find('input[type="text"]');
    await input.setValue("test");
    await input.trigger("keydown", { key: "ArrowDown" });

    const selected = wrapper.find('.result-item.selected');
    expect(selected.exists()).toBe(true);
  });

  it("activates result on Enter", async () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: true }
    });

    const input = wrapper.find('input[type="text"]');
    await input.setValue("test");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  it("prevents navigation beyond bounds", async () => {
    wrapper = mount(WorkspaceLauncherModal, {
      props: { open: true }
    });

    const input = wrapper.find('input[type="text"]');
    await input.setValue("test");
    
    // Try to go up from first item
    await input.trigger("keydown", { key: "ArrowUp" });
    
    // Should stay at index 0
    const selected = wrapper.findAll('.result-item')[0];
    expect(selected.classes()).toContain('selected');
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `npm test -- src/lib/__tests__/workspaceLauncher.test.ts src/components/__tests__/WorkspaceLauncherModal.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit comprehensive tests**

```bash
git add src/lib/__tests__/workspaceLauncher.test.ts src/components/__tests__/WorkspaceLauncherModal.test.ts
git commit -m "test: add comprehensive tests for launcher functionality"
```

---

### Task 9: Integration Testing and Polish

**Files:**
- Create: `src/layouts/__tests__/WorkspaceLayout-launcher.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// src/layouts/__tests__/WorkspaceLayout-launcher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import WorkspaceLayout from "../WorkspaceLayout.vue";

// Mock all the heavy dependencies
vi.mock("@/components/WorkspaceLauncherModal.vue", () => ({
  default: {
    name: "WorkspaceLauncherModal",
    props: ["open"],
    emits: ["close", "activate"],
    template: `
      <div v-if="open" data-testid="launcher-modal">
        <button @click="$emit('activate', { type: 'thread', item: { id: '1' } })">
          Activate Thread
        </button>
      </div>
    `
  }
}));

describe("WorkspaceLayout launcher integration", () => {
  let wrapper: ReturnType<typeof mount>;

  beforeEach(() => {
    global.window = {
      ...global.window,
      workspaceApi: {
        getSnapshot: vi.fn().mockResolvedValue({
          activeWorktree: { threads: [] }
        }),
        setActiveThread: vi.fn()
      }
    } as any;
  });

  it("opens launcher on keyboard shortcut", async () => {
    wrapper = mount(WorkspaceLayout);
    
    // Simulate ⌘K keypress
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      code: "KeyK"
    });
    document.dispatchEvent(event);

    await wrapper.vm.$nextTick();
    
    const modal = wrapper.find('[data-testid="launcher-modal"]');
    expect(modal.exists()).toBe(true);
  });

  it("closes launcher and activates thread", async () => {
    wrapper = mount(WorkspaceLayout);
    
    // Open launcher
    await wrapper.vm.handleOpenWorkspaceLauncher();
    
    // Activate a result
    const activateButton = wrapper.find("button");
    await activateButton.trigger("click");

    // Modal should close
    const modal = wrapper.find('[data-testid="launcher-modal"]');
    expect(modal.exists()).toBe(false);
    
    // Thread should be activated
    expect(window.workspaceApi.setActiveThread).toHaveBeenCalledWith("1");
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout-launcher.test.ts`
Expected: PASS

- [ ] **Step 3: Add visual polish to modal**

```vue
<!-- Enhance styles in src/components/WorkspaceLauncherModal.vue -->
<style scoped>
/* Add dark mode support */
@media (prefers-color-scheme: dark) {
  .modal-content {
    background: #1f2937;
    color: #f9fafb;
  }
  
  .search-input {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }
  
  .search-input:focus {
    border-color: #60a5fa;
  }
  
  .result-item:hover,
  .result-item.selected {
    background-color: #374151;
  }
  
  .result-title {
    color: #f9fafb;
  }
  
  .result-subtitle {
    color: #9ca3af;
  }
  
  .search-hint {
    color: #9ca3af;
  }
}

/* Add better focus indicators */
.result-item.selected {
  border-left: 3px solid #3b82f6;
}

/* Improve spacing */
.result-item {
  border-left: 3px solid transparent;
}
</style>
```

- [ ] **Step 4: Test visual improvements**

Run: `npm run dev:electron`
Test: Open launcher, verify styling in light/dark mode
Expected: Clean, polished appearance

- [ ] **Step 5: Commit integration tests and polish**

```bash
git add src/layouts/__tests__/WorkspaceLayout-launcher.test.ts src/components/WorkspaceLauncherModal.vue
git commit -m "test: add integration tests and visual polish for launcher"
```

---

### Task 10: Documentation and Final Testing

**Files:**
- Create: `docs/features/workspace-launcher.md`

- [ ] **Step 1: Write user documentation**

```markdown
# Workspace Launcher

The workspace launcher provides Raycast-style fuzzy search across threads and files in your current workspace.

## Usage

**Open launcher:** ⌘K (macOS) or Ctrl+K (Windows/Linux)

**Search modes:**
- **Default:** Search threads and files in the current branch
- **Worktree mode:** Prefix query with `@wt` to search files across linked worktrees

**Navigation:**
- ↑/↓ arrows to navigate results
- Enter to activate selected result
- Escape to close

## Search Scope

The launcher searches within your **current workspace only**:
- Thread titles and agent types
- Files in the current branch (same scope as Files tab)
- With `@wt` prefix: files in linked worktrees

## File Ignoring

Same ignore rules as the Files tab:
- `node_modules/`
- `.git/`
- `dist/`
- `dist-electron/`

## Examples

- `parser` → finds threads with "parser" in title + files containing "parser"
- `@wt config` → finds config files across all worktrees
- `@wt` → shows hint to type worktree search query
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS, no regressions

- [ ] **Step 3: Test all keybindings still work**

Run: `npm run dev:electron`
Test: ⌘1-9, ⌘[, ⌘], ⌘B, ⌘⇧T, ⌘⇧F, ⌘K
Expected: All shortcuts work as documented

- [ ] **Step 4: Test launcher functionality end-to-end**

Manual test checklist:
- [ ] ⌘K opens launcher with focus on input
- [ ] Typing searches threads and files
- [ ] Arrow keys navigate results
- [ ] Enter activates selected result (thread activation works)
- [ ] Escape closes launcher
- [ ] `@wt` prefix shows worktree mode (even if no worktrees)
- [ ] Modal closes when clicking backdrop
- [ ] No console errors during normal usage

- [ ] **Step 5: Commit documentation**

```bash
git add docs/features/workspace-launcher.md
git commit -m "docs: add workspace launcher user documentation"
```

---

### Task 11: Final Integration and Cleanup

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue` (cleanup)

- [ ] **Step 1: Clean up console.log statements**

```typescript
// In src/layouts/WorkspaceLayout.vue, remove console.log from handleLauncherActivate
function handleLauncherActivate(result: SearchResult): void {
  workspaceLauncherOpen.value = false;
  
  if (result.type === "thread") {
    const threadItem = result.item as any;
    const api = getApi();
    if (api) {
      api.setActiveThread(threadItem.id);
    }
  } else {
    const fileItem = result.item as any;
    centerTab.value = "files";
    
    nextTick(() => {
      const event = new CustomEvent("launcher-select-file", {
        detail: { relativePath: fileItem.relativePath }
      });
      window.dispatchEvent(event);
    });
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Verify linting passes**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Run final test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 5: Test production build**

Run: `npm run build:app`
Expected: Build succeeds without errors

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete workspace launcher with Fuse.js search

- Add ⌘K/Ctrl+K global shortcut for workspace launcher
- Implement Raycast-style modal with fuzzy search using Fuse.js  
- Support thread search and file search in current branch
- Add @wt prefix for worktree-scoped file search
- Include keyboard navigation (↑↓, Enter, Escape)
- Add comprehensive test coverage
- Integrate with existing WorkspaceApi and keybinding system"
```

---

## Summary

This plan implements a complete Raycast-style workspace launcher with:

1. **Fuse.js integration** for fuzzy search ranking
2. **Dual search modes** - default (threads + branch files) and `@wt` (worktree files)
3. **Keyboard-first UX** with ⌘K shortcut and arrow navigation  
4. **Existing API reuse** - WorkspaceApi for data, keybinding system for shortcuts
5. **Comprehensive testing** - unit, component, and integration tests
6. **Visual polish** - dark mode support, focus indicators, clean styling

The implementation follows TDD principles with failing tests first, minimal implementations, and frequent commits. Each task builds incrementally toward the complete feature while maintaining test coverage and code quality.