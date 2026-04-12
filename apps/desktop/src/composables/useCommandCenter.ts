import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";
import { eventMatchesShortcut, isMacPlatform, type PhysicalShortcut } from "@/keybindings/registry";

function modKey(mac: boolean, ev: KeyboardEvent): boolean {
  return mac ? ev.metaKey : ev.ctrlKey;
}

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
  const s: PhysicalShortcut = { mod: true, code };
  if (options.shift) s.shift = true;
  if (options.alt) s.alt = true;
  return eventMatchesShortcut(ev, s);
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
