# Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing `⌘K` workspace launcher into a Command Center with a quick-action icon bar, scoped `⌘1–5 / ⌘B / ⌘S` shortcuts, and active filter support; remove the global `⌘1–9` project/workspace switching.

**Architecture:** A new `useCommandCenter` composable owns `isOpen`, `activeFilter`, and a scoped keydown listener. `WorkspaceLauncherModal` gains an icon bar prop-driven from the composable. `WorkspaceLayout` replaces `workspaceLauncherOpen` with the composable and removes all project-switching digit-slot code.

**Tech Stack:** Vue 3 (Composition API, `defineModel`, `ref`, `computed`), TypeScript, Pinia (keybindingsStore), Lucide icons, Vitest

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/desktop/src/keybindings/registry.ts` |
| Modify | `apps/desktop/src/composables/useWorkspaceKeybindings.ts` |
| **Create** | `apps/desktop/src/composables/useCommandCenter.ts` |
| **Create** | `apps/desktop/src/composables/__tests__/useCommandCenter.test.ts` |
| Modify | `apps/desktop/src/components/WorkspaceLauncherModal.vue` |
| Modify | `apps/desktop/src/layouts/WorkspaceLayout.vue` |

---

## Task 1: Remove `switchProjectOrTerminalDigit` from the keybinding registry

**Files:**
- Modify: `apps/desktop/src/keybindings/registry.ts`

- [ ] **Step 1: Remove `switchProjectOrTerminalDigit` from the `KeybindingId` union type**

  In `registry.ts`, find the `KeybindingId` type. It currently reads:
  ```ts
  export type KeybindingId =
    | "switchProjectOrTerminalDigit"
    | "prevThread"
    | "nextThread"
    ...
  ```
  Remove the `"switchProjectOrTerminalDigit"` line:
  ```ts
  export type KeybindingId =
    | "prevThread"
    | "nextThread"
    ...
  ```

- [ ] **Step 2: Remove the entry from `KEYBINDING_DEFINITIONS`**

  Find and delete this entire object from the `KEYBINDING_DEFINITIONS` array:
  ```ts
  {
    id: "switchProjectOrTerminalDigit",
    label: "Switch project or terminal (number key)",
    category: "Navigation",
    shortcut: mod("Digit1"),
    notes:
      "⌘1–⌘9 / Ctrl+1–9: first select open projects in order, then terminal tabs. With the bottom terminal panel open and focus in a terminal, ⌘1–⌘9 switch Terminal 1…n only. Agent, Git Diff, and Files have no ⌘-number shortcut."
  },
  ```

- [ ] **Step 3: Run typecheck to confirm no remaining references**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm typecheck
  ```
  Expected: no errors referencing `switchProjectOrTerminalDigit`.

- [ ] **Step 4: Run tests**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm test
  ```
  Expected: all pass. The `keybindingsStore.test.ts` test `"effectiveDefinitions matches defaults when empty"` will still pass because it compares against the updated `KEYBINDING_DEFINITIONS`.

- [ ] **Step 5: Commit**

  ```bash
  git -C /Users/blaisetiong/Developer/instrument add apps/desktop/src/keybindings/registry.ts
  git -C /Users/blaisetiong/Developer/instrument commit -m "feat: remove switchProjectOrTerminalDigit keybinding"
  ```

---

## Task 2: Strip project-switching from `useWorkspaceKeybindings`

**Files:**
- Modify: `apps/desktop/src/composables/useWorkspaceKeybindings.ts`

- [ ] **Step 1: Remove `projectIds` and `onSelectProject` from `WorkspaceKeybindingContext`**

  Delete these two lines from the type:
  ```ts
  /** Project ids in tab order; first nine get ⌘1–⌘9. */
  projectIds: () => readonly string[];
  ```
  and:
  ```ts
  onSelectProject: (projectId: string) => void;
  ```

- [ ] **Step 2: Remove the `switchProjectOrTerminalDigit` skip from `findStaticBindingId`**

  The function currently has:
  ```ts
  function findStaticBindingId(ev: KeyboardEvent, definitions: KeybindingDefinition[]): KeybindingId | null {
    for (const d of definitions) {
      if (d.id === "switchProjectOrTerminalDigit") continue;
      if (eventMatchesBinding(ev, d)) return d.id;
    }
    return null;
  }
  ```
  Remove the skip line — the id no longer exists:
  ```ts
  function findStaticBindingId(ev: KeyboardEvent, definitions: KeybindingDefinition[]): KeybindingId | null {
    for (const d of definitions) {
      if (eventMatchesBinding(ev, d)) return d.id;
    }
    return null;
  }
  ```

- [ ] **Step 3: Simplify the digit-slot handler — keep terminal switching only**

  Replace the entire `if (digitSlot != null && workspaceUi)` block (lines 102–137) with this:
  ```ts
  if (digitSlot != null && workspaceUi) {
    // While focus is in the integrated terminal and the bottom panel is open,
    // ⌘1…⌘n switch terminal tabs only.
    if (ctx.terminalPanelOpen() && inTerminal) {
      const shells = ctx.shellSlotIds();
      if (digitSlot < shells.length) {
        ev.preventDefault();
        const slotId = shells[digitSlot];
        if (slotId) ctx.onSelectCenterTab(`shell:${slotId}`);
      }
      return;
    }
  }
  ```

- [ ] **Step 4: Remove unused imports**

  After the changes, `MOD_DIGIT_SLOT_CODES` is still needed (used in `modDigitSlotIndex`). No import changes needed.

- [ ] **Step 5: Run typecheck**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm typecheck
  ```
  Expected: TypeScript will flag `WorkspaceLayout.vue` for passing `projectIds` and `onSelectProject` that no longer exist on the context type. That's expected — we fix it in Task 5.

- [ ] **Step 6: Commit**

  ```bash
  git -C /Users/blaisetiong/Developer/instrument add apps/desktop/src/composables/useWorkspaceKeybindings.ts
  git -C /Users/blaisetiong/Developer/instrument commit -m "feat: remove project digit-slot switching from workspace keybindings"
  ```

---

## Task 3: Create `useCommandCenter` composable + tests

**Files:**
- Create: `apps/desktop/src/composables/useCommandCenter.ts`
- Create: `apps/desktop/src/composables/__tests__/useCommandCenter.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/desktop/src/composables/__tests__/useCommandCenter.test.ts`:

  ```ts
  import { describe, expect, it, vi, beforeEach } from "vitest";
  import { createCommandCenter } from "../useCommandCenter";

  function makeCtx(overrides: Partial<Parameters<typeof createCommandCenter>[0]> = {}) {
    return {
      onSelectCenterTab: vi.fn(),
      onToggleSidebar: vi.fn(),
      onOpenSettings: vi.fn(),
      ...overrides
    };
  }

  describe("createCommandCenter", () => {
    let ctx: ReturnType<typeof makeCtx>;

    beforeEach(() => {
      ctx = makeCtx();
    });

    it("starts closed with no filter", () => {
      const cc = createCommandCenter(ctx);
      expect(cc.isOpen.value).toBe(false);
      expect(cc.activeFilter.value).toBeNull();
    });

    it("toggle opens and closes", () => {
      const cc = createCommandCenter(ctx);
      cc.toggle();
      expect(cc.isOpen.value).toBe(true);
      cc.toggle();
      expect(cc.isOpen.value).toBe(false);
    });

    it("close resets activeFilter", () => {
      const cc = createCommandCenter(ctx);
      cc.isOpen.value = true;
      cc.activeFilter.value = "agents";
      cc.close();
      expect(cc.isOpen.value).toBe(false);
      expect(cc.activeFilter.value).toBeNull();
    });

    it("quickActions has 7 entries", () => {
      const cc = createCommandCenter(ctx);
      expect(cc.quickActions).toHaveLength(7);
    });

    it("agent action calls onSelectCenterTab('agent') and closes", () => {
      const cc = createCommandCenter(ctx);
      cc.isOpen.value = true;
      const agentAction = cc.quickActions.find((a) => a.id === "agent")!;
      agentAction.action();
      expect(ctx.onSelectCenterTab).toHaveBeenCalledWith("agent");
      expect(cc.isOpen.value).toBe(false);
    });

    it("diff action calls onSelectCenterTab('diff') and closes", () => {
      const cc = createCommandCenter(ctx);
      cc.isOpen.value = true;
      const diffAction = cc.quickActions.find((a) => a.id === "diff")!;
      diffAction.action();
      expect(ctx.onSelectCenterTab).toHaveBeenCalledWith("diff");
      expect(cc.isOpen.value).toBe(false);
    });

    it("files action calls onSelectCenterTab('files') and closes", () => {
      const cc = createCommandCenter(ctx);
      cc.isOpen.value = true;
      const filesAction = cc.quickActions.find((a) => a.id === "files")!;
      filesAction.action();
      expect(ctx.onSelectCenterTab).toHaveBeenCalledWith("files");
      expect(cc.isOpen.value).toBe(false);
    });

    it("searchThreads toggles activeFilter to agents", () => {
      const cc = createCommandCenter(ctx);
      const action = cc.quickActions.find((a) => a.id === "searchThreads")!;
      action.action();
      expect(cc.activeFilter.value).toBe("agents");
      action.action(); // toggle off
      expect(cc.activeFilter.value).toBeNull();
    });

    it("searchWorktrees toggles activeFilter to worktrees", () => {
      const cc = createCommandCenter(ctx);
      const action = cc.quickActions.find((a) => a.id === "searchWorktrees")!;
      action.action();
      expect(cc.activeFilter.value).toBe("worktrees");
      action.action();
      expect(cc.activeFilter.value).toBeNull();
    });

    it("sidebar action calls onToggleSidebar and closes", () => {
      const cc = createCommandCenter(ctx);
      cc.isOpen.value = true;
      const action = cc.quickActions.find((a) => a.id === "sidebar")!;
      action.action();
      expect(ctx.onToggleSidebar).toHaveBeenCalled();
      expect(cc.isOpen.value).toBe(false);
    });

    it("settings action calls onOpenSettings and closes", () => {
      const cc = createCommandCenter(ctx);
      cc.isOpen.value = true;
      const action = cc.quickActions.find((a) => a.id === "settings")!;
      action.action();
      expect(ctx.onOpenSettings).toHaveBeenCalled();
      expect(cc.isOpen.value).toBe(false);
    });

    it("switching filter replaces previous filter (not additive)", () => {
      const cc = createCommandCenter(ctx);
      const threads = cc.quickActions.find((a) => a.id === "searchThreads")!;
      const worktrees = cc.quickActions.find((a) => a.id === "searchWorktrees")!;
      threads.action();
      expect(cc.activeFilter.value).toBe("agents");
      worktrees.action();
      expect(cc.activeFilter.value).toBe("worktrees");
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm --filter workbench test src/composables/__tests__/useCommandCenter.test.ts
  ```
  Expected: FAIL — `Cannot find module '../useCommandCenter'`.

- [ ] **Step 3: Implement `useCommandCenter.ts`**

  Create `apps/desktop/src/composables/useCommandCenter.ts`:

  ```ts
  import { ref, type Ref } from "vue";
  import { eventMatchesShortcut, isMacPlatform } from "@/keybindings/registry";

  export type CommandCenterFilter = "agents" | "worktrees" | null;

  export type QuickAction = {
    id: string;
    label: string;
    shortcutLabel: string;
    isFilter: boolean;
    filterId: CommandCenterFilter;
    action: () => void;
  };

  export type CommandCenterContext = {
    onSelectCenterTab: (tab: "agent" | "diff" | "files") => void;
    onToggleSidebar: () => void;
    onOpenSettings: () => void;
  };

  export type CommandCenterInstance = {
    isOpen: Ref<boolean>;
    activeFilter: Ref<CommandCenterFilter>;
    quickActions: QuickAction[];
    open: () => void;
    close: () => void;
    toggle: () => void;
  };

  function modKey(mac: boolean, ev: KeyboardEvent): boolean {
    return mac ? ev.metaKey : ev.ctrlKey;
  }

  function matchesScoped(
    ev: KeyboardEvent,
    code: string,
    options: { shift?: boolean; alt?: boolean } = {}
  ): boolean {
    if (ev.repeat) return false;
    if (ev.code !== code) return false;
    const mac = isMacPlatform();
    if (!modKey(mac, ev)) return false;
    if (Boolean(options.shift) !== ev.shiftKey) return false;
    if (Boolean(options.alt) !== ev.altKey) return false;
    if (mac && ev.ctrlKey) return false;
    if (!mac && ev.metaKey) return false;
    return true;
  }

  /**
   * Pure factory — call once per WorkspaceLayout mount.
   * The composable (useCommandCenter) wraps this and attaches/removes the keydown listener.
   */
  export function createCommandCenter(ctx: CommandCenterContext): CommandCenterInstance {
    const isOpen = ref(false);
    const activeFilter = ref<CommandCenterFilter>(null);

    function open(): void {
      isOpen.value = true;
    }

    function close(): void {
      isOpen.value = false;
      activeFilter.value = null;
    }

    function toggle(): void {
      if (isOpen.value) {
        close();
      } else {
        open();
      }
    }

    function toggleFilter(filterId: "agents" | "worktrees"): void {
      activeFilter.value = activeFilter.value === filterId ? null : filterId;
    }

    const quickActions: QuickAction[] = [
      {
        id: "agent",
        label: "Agent",
        shortcutLabel: "⌘1",
        isFilter: false,
        filterId: null,
        action: () => {
          ctx.onSelectCenterTab("agent");
          close();
        }
      },
      {
        id: "diff",
        label: "Git Diff",
        shortcutLabel: "⌘2",
        isFilter: false,
        filterId: null,
        action: () => {
          ctx.onSelectCenterTab("diff");
          close();
        }
      },
      {
        id: "files",
        label: "Files",
        shortcutLabel: "⌘3",
        isFilter: false,
        filterId: null,
        action: () => {
          ctx.onSelectCenterTab("files");
          close();
        }
      },
      {
        id: "searchThreads",
        label: "Search Threads",
        shortcutLabel: "⌘4",
        isFilter: true,
        filterId: "agents",
        action: () => toggleFilter("agents")
      },
      {
        id: "searchWorktrees",
        label: "Search Worktrees",
        shortcutLabel: "⌘5",
        isFilter: true,
        filterId: "worktrees",
        action: () => toggleFilter("worktrees")
      },
      {
        id: "sidebar",
        label: "Toggle Sidebar",
        shortcutLabel: "⌘B",
        isFilter: false,
        filterId: null,
        action: () => {
          ctx.onToggleSidebar();
          close();
        }
      },
      {
        id: "settings",
        label: "Settings",
        shortcutLabel: "⌘S",
        isFilter: false,
        filterId: null,
        action: () => {
          ctx.onOpenSettings();
          close();
        }
      }
    ];

    return { isOpen, activeFilter, quickActions, open, close, toggle };
  }

  /**
   * Vue composable: creates the Command Center and attaches the scoped keydown listener.
   * Must be called from within a Vue component's setup().
   */
  export function useCommandCenter(ctx: CommandCenterContext): CommandCenterInstance {
    const { onBeforeUnmount, onMounted } = await import("vue");

    const cc = createCommandCenter(ctx);

    function onKeydown(ev: KeyboardEvent): void {
      if (!cc.isOpen.value) return;

      if (matchesScoped(ev, "Digit1")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "agent")?.action();
        return;
      }
      if (matchesScoped(ev, "Digit2")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "diff")?.action();
        return;
      }
      if (matchesScoped(ev, "Digit3")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "files")?.action();
        return;
      }
      if (matchesScoped(ev, "Digit4")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "searchThreads")?.action();
        return;
      }
      if (matchesScoped(ev, "Digit5")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "searchWorktrees")?.action();
        return;
      }
      if (matchesScoped(ev, "KeyB")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "sidebar")?.action();
        return;
      }
      if (matchesScoped(ev, "KeyS")) {
        ev.preventDefault();
        cc.quickActions.find((a) => a.id === "settings")?.action();
        return;
      }
    }

    onMounted(() => window.addEventListener("keydown", onKeydown, { capture: true }));
    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, { capture: true }));

    return cc;
  }
  ```

  > **Note:** `useCommandCenter` uses a dynamic import of `onMounted`/`onBeforeUnmount` because those are Vue lifecycle hooks and `createCommandCenter` (used in tests without a component context) must not call them. If the project's TS config dislikes top-level await in a non-async function, change the import to a static import at the top of the file and only call the lifecycle hooks inside `useCommandCenter`.

  **Fix the import — replace the dynamic import with static:**

  At the top of the file, add:
  ```ts
  import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";
  ```

  And inside `useCommandCenter`, remove the `await import("vue")` line — `onMounted` and `onBeforeUnmount` are already imported.

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm --filter workbench test src/composables/__tests__/useCommandCenter.test.ts
  ```
  Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git -C /Users/blaisetiong/Developer/instrument add \
    apps/desktop/src/composables/useCommandCenter.ts \
    apps/desktop/src/composables/__tests__/useCommandCenter.test.ts
  git -C /Users/blaisetiong/Developer/instrument commit -m "feat: add useCommandCenter composable with scoped keybindings"
  ```

---

## Task 4: Add icon bar + filter support to `WorkspaceLauncherModal`

**Files:**
- Modify: `apps/desktop/src/components/WorkspaceLauncherModal.vue`

- [ ] **Step 1: Add `quickActions` and `activeFilter` props**

  In the `<script setup>` block, after the existing imports, add:
  ```ts
  import type { QuickAction, CommandCenterFilter } from "@/composables/useCommandCenter";
  ```

  After the `defineEmits` block, add:
  ```ts
  const props = defineProps<{
    quickActions: QuickAction[];
    activeFilter: CommandCenterFilter;
  }>();
  ```

- [ ] **Step 2: Filter displayed rows based on `activeFilter`**

  The existing `rows` computed currently returns `[...cmds, ...switchRows, ...rest]`. Add a filter step at the end. Replace:
  ```ts
  const rows = computed<LauncherRow[]>(() => {
    const cmds = searchLauncherCommands(commandSearchText.value, commandShortcutHints.value);
    const switchRows = searchLauncherWorkspaceSwitch(
      parsed.value,
      commandSearchText.value,
      workspace.projects,
      workspace.activeProjectId,
      workspace.worktrees,
      workspace.activeWorktreeId
    );
    const rest = searchLauncherRows(
      parsed.value,
      workspace.activeThreads,
      branchFiles.value,
      otherWorktreeFiles.value
    );
    return [...cmds, ...switchRows, ...rest];
  });
  ```
  With:
  ```ts
  const rows = computed<LauncherRow[]>(() => {
    const cmds = searchLauncherCommands(commandSearchText.value, commandShortcutHints.value);
    const switchRows = searchLauncherWorkspaceSwitch(
      parsed.value,
      commandSearchText.value,
      workspace.projects,
      workspace.activeProjectId,
      workspace.worktrees,
      workspace.activeWorktreeId
    );
    const rest = searchLauncherRows(
      parsed.value,
      workspace.activeThreads,
      branchFiles.value,
      otherWorktreeFiles.value
    );
    const all = [...cmds, ...switchRows, ...rest];
    if (!props.activeFilter) return all;
    return all.filter((r) => r.section === props.activeFilter);
  });
  ```

- [ ] **Step 3: Add the icon bar to the template**

  In the `<template>`, find the search input row:
  ```html
  <div class="flex items-center gap-2 border-b border-border px-3 py-2">
    <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <input ... />
  </div>
  ```

  Replace it with (add the icon bar inside the same flex container, after the input):
  ```html
  <div class="flex items-center gap-2 border-b border-border px-3 py-2">
    <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      class="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      placeholder="Search commands, workspaces, threads, files…"
      autocomplete="off"
      spellcheck="false"
      data-testid="workspace-launcher-input"
      @keydown="onInputKeydown"
    />
    <div class="flex shrink-0 items-center gap-1" role="toolbar" aria-label="Quick actions">
      <button
        v-for="action in props.quickActions"
        :key="action.id"
        type="button"
        :title="`${action.label} (${action.shortcutLabel})`"
        :aria-label="action.label"
        :aria-pressed="action.isFilter && activeFilter === action.filterId"
        class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        :class="{ 'bg-muted text-foreground': action.isFilter && activeFilter === action.filterId }"
        @click="action.action()"
        @mousedown.prevent
      >
        <CommandCenterIcon :action-id="action.id" />
      </button>
    </div>
  </div>
  ```

- [ ] **Step 4: Create the `CommandCenterIcon` inline component**

  Add this to the `<script setup>` block (after existing imports). This avoids needing a separate file for a tiny render-only component:

  ```ts
  import {
    Bot,
    GitBranch,
    Files,
    MessageSquare,
    GitFork,
    PanelLeftClose,
    Settings2
  } from "lucide-vue-next";

  const ACTION_ICONS: Record<string, typeof Bot> = {
    agent: Bot,
    diff: GitBranch,
    files: Files,
    searchThreads: MessageSquare,
    searchWorktrees: GitFork,
    sidebar: PanelLeftClose,
    settings: Settings2
  };
  ```

  And replace the `<CommandCenterIcon :action-id="action.id" />` placeholder in the template with an inline dynamic component:
  ```html
  <component :is="ACTION_ICONS[action.id]" class="size-4" aria-hidden="true" />
  ```

  So the button becomes:
  ```html
  <button
    v-for="action in props.quickActions"
    :key="action.id"
    type="button"
    :title="`${action.label} (${action.shortcutLabel})`"
    :aria-label="action.label"
    :aria-pressed="action.isFilter && props.activeFilter === action.filterId"
    class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    :class="{ 'bg-muted text-foreground': action.isFilter && props.activeFilter === action.filterId }"
    @click="action.action()"
    @mousedown.prevent
  >
    <component :is="ACTION_ICONS[action.id]" class="size-4" aria-hidden="true" />
  </button>
  ```

- [ ] **Step 5: Run typecheck**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm typecheck
  ```
  Expected: errors only in `WorkspaceLayout.vue` (not yet updated). No errors in `WorkspaceLauncherModal.vue`.

- [ ] **Step 6: Commit**

  ```bash
  git -C /Users/blaisetiong/Developer/instrument add apps/desktop/src/components/WorkspaceLauncherModal.vue
  git -C /Users/blaisetiong/Developer/instrument commit -m "feat: add command center icon bar and activeFilter to WorkspaceLauncherModal"
  ```

---

## Task 5: Wire `useCommandCenter` into `WorkspaceLayout`

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Import `useCommandCenter`**

  At the top of the `<script setup>` block, add:
  ```ts
  import { useCommandCenter } from "@/composables/useCommandCenter";
  ```

- [ ] **Step 2: Replace `workspaceLauncherOpen` with `useCommandCenter`**

  Find line 293:
  ```ts
  const workspaceLauncherOpen = ref(false);
  ```
  Delete it. In its place, instantiate the composable (this must come after `mainCenterTab`, `toggleThreadsSidebar`, and `handleConfigureCommands` are defined — move this block to after those definitions):
  ```ts
  const commandCenter = useCommandCenter({
    onSelectCenterTab: (tab) => {
      mainCenterTab.value = tab;
    },
    onToggleSidebar: toggleThreadsSidebar,
    onOpenSettings: handleConfigureCommands
  });
  ```

  > `toggleThreadsSidebar` is defined at line 1299 and `handleConfigureCommands` at line 1275 in the original file. `useCommandCenter` call must be placed after both of those definitions. Find the end of those function declarations and place the `useCommandCenter` call immediately after.

- [ ] **Step 3: Remove `projectDigitSlotCount` computed and simplify terminal shortcut hints**

  Delete line 313:
  ```ts
  const projectDigitSlotCount = computed(() => Math.min(MOD_DIGIT_SLOT_CODES.length, workspace.projects.length));
  ```

  In `centerPanelTabs`, find the terminal tab map (around line 336):
  ```ts
  const projectSlots = projectDigitSlotCount.value;
  ...
  const slotIndex = terminalPanelOpen.value ? i : projectSlots + i;
  ```
  Replace those two lines with:
  ```ts
  const slotIndex = i;
  ```
  The `shortcutHint` line below (`slotIndex < MOD_DIGIT_SLOT_CODES.length ? ...`) stays unchanged.

- [ ] **Step 4: Extend `onSelectCenterTab` in `useWorkspaceKeybindings` call**

  Find the `useWorkspaceKeybindings` call (around line 1370). The `onSelectCenterTab` currently only handles `shell:` tabs:
  ```ts
  onSelectCenterTab: (tab) => {
    if (tab.startsWith("shell:")) {
      shellOverlayTab.value = tab as `shell:${string}`;
      terminalPanelOpen.value = true;
    }
  },
  ```
  It needs no change — terminal switching via `onSelectCenterTab("shell:...")` still works. The Command Center uses `ctx.onSelectCenterTab("agent" | "diff" | "files")` directly via its own context object. No conflict.

- [ ] **Step 5: Remove `projectIds` and `onSelectProject` from the `useWorkspaceKeybindings` call**

  Inside the `useWorkspaceKeybindings({...})` call, delete:
  ```ts
  projectIds: () => workspace.projects.map((p) => p.id),
  ```
  and:
  ```ts
  onSelectProject: (projectId) => {
    void handleSelectProject(projectId);
  },
  ```

- [ ] **Step 6: Replace `toggleWorkspaceLauncher` function**

  Find line 1317:
  ```ts
  function toggleWorkspaceLauncher(): void {
    workspaceLauncherOpen.value = !workspaceLauncherOpen.value;
  }
  ```
  Replace with:
  ```ts
  function toggleWorkspaceLauncher(): void {
    commandCenter.toggle();
  }
  ```

- [ ] **Step 7: Replace remaining `workspaceLauncherOpen.value = false` calls**

  Search for every `workspaceLauncherOpen.value = false` in the file (lines 1322, 1327, 1337, 1357, 1362). Replace each with:
  ```ts
  commandCenter.close();
  ```

- [ ] **Step 8: Update `launcherConsumesNavShortcuts`**

  Find in the `useWorkspaceKeybindings` call:
  ```ts
  launcherConsumesNavShortcuts: () => workspaceLauncherOpen.value,
  ```
  Replace with:
  ```ts
  launcherConsumesNavShortcuts: () => commandCenter.isOpen.value,
  ```

- [ ] **Step 9: Update the template binding for `WorkspaceLauncherModal`**

  Find line 1981:
  ```html
  v-model="workspaceLauncherOpen"
  ```
  Replace with:
  ```html
  v-model="commandCenter.isOpen.value"
  ```
  And add the two new props:
  ```html
  :quick-actions="commandCenter.quickActions"
  :active-filter="commandCenter.activeFilter.value"
  ```

  The full element should look like:
  ```html
  <WorkspaceLauncherModal
    v-model="commandCenter.isOpen.value"
    :quick-actions="commandCenter.quickActions"
    :active-filter="commandCenter.activeFilter.value"
    @pick-thread="onLauncherPickThread"
    @pick-file="onLauncherPickFile"
    @pick-command="onLauncherPickCommand"
    @pick-project="onLauncherPickProject"
    @pick-worktree="onLauncherPickWorktree"
  />
  ```

- [ ] **Step 10: Remove unused `MOD_DIGIT_SLOT_CODES` import if no longer used**

  Check if `MOD_DIGIT_SLOT_CODES` is still used in `WorkspaceLayout.vue` after removing `projectDigitSlotCount`. It's used in `centerPanelTabs` for the terminal `shortcutHint` (`MOD_DIGIT_SLOT_CODES[slotIndex]`). Keep the import.

- [ ] **Step 11: Run typecheck — expect clean**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm typecheck
  ```
  Expected: no errors.

- [ ] **Step 12: Run full test suite**

  ```bash
  cd /Users/blaisetiong/Developer/instrument && pnpm test
  ```
  Expected: all pass.

- [ ] **Step 13: Commit**

  ```bash
  git -C /Users/blaisetiong/Developer/instrument add apps/desktop/src/layouts/WorkspaceLayout.vue
  git -C /Users/blaisetiong/Developer/instrument commit -m "feat: wire Command Center into WorkspaceLayout, remove project digit-slot switching"
  ```

---

## Self-Review Checklist

- [x] Registry: `switchProjectOrTerminalDigit` removed from type union and definitions array — Task 1
- [x] `useWorkspaceKeybindings`: `projectIds` / `onSelectProject` removed, project digit-slot handler removed, terminal switching kept — Task 2
- [x] `useCommandCenter`: 7 quick actions, `activeFilter` toggle, scoped keydown listener, `close()` resets filter — Task 3
- [x] `WorkspaceLauncherModal`: icon bar renders from `quickActions` prop, `rows` filtered by `activeFilter` — Task 4
- [x] `WorkspaceLayout`: `commandCenter` replaces `workspaceLauncherOpen`, `projectDigitSlotCount` removed, terminal hint uses `slotIndex = i`, all close calls migrated — Task 5
- [x] No TBD/TODO in any task
- [x] Type names are consistent: `CommandCenterFilter`, `QuickAction`, `CommandCenterContext`, `CommandCenterInstance` used identically across tasks 3, 4, 5
- [x] `createCommandCenter` (testable, no Vue lifecycle) vs `useCommandCenter` (lifecycle-bound) — distinction preserved
