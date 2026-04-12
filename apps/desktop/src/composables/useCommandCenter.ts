import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";
import { eventMatchesShortcut, isMacPlatform, type PhysicalShortcut } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

function modKey(mac: boolean, ev: KeyboardEvent): boolean {
  return mac ? ev.metaKey : ev.ctrlKey;
}

export type CommandCenterFilter = "agents" | "worktrees" | null;

export type QuickAction = {
  id: string;
  label: string;
  emoji: string;
  /** Human-readable shortcut for this app (e.g. ⌘1); shown in help and tooltips. */
  shortcutLabel: string;
  /** One-line explanation for the command center help list. */
  description: string;
  /** Typed prefix that activates this action's search scope (e.g. "@threads"). */
  searchPrefix?: string;
  isFilter: boolean;
  filterId: CommandCenterFilter;
  action: () => void;
};

/** Workspace-wide center-tab shortcuts (from Keyboard settings); shown on launcher help rows. */
export type CenterPaneShortcutLabels = {
  agent: string;
  git: string;
  files: string;
};

export type CommandCenterContext = {
  onSelectCenterTab: (tab: "agent" | "diff" | "files") => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  centerPaneShortcutLabels?: CenterPaneShortcutLabels;
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

  const pane = ctx.centerPaneShortcutLabels;
  const agentWorkspace = pane?.agent ?? "⌘⇧A";
  const gitWorkspace = pane?.git ?? "⌘⇧G";
  const filesWorkspace = pane?.files ?? "⌘⇧E";

  const quickActions: QuickAction[] = [
    {
      id: "agent",
      label: "Agent",
      emoji: "🤖",
      shortcutLabel: agentWorkspace,
      description: `Open the Agent view (chat and tools) in the center panel (${agentWorkspace} from the workspace, or ⌘1 with the launcher open).`,
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
      emoji: "🔀",
      shortcutLabel: gitWorkspace,
      description: `Open source control and the diff view for the active worktree (${gitWorkspace} from the workspace, or ⌘2 with the launcher open).`,
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
      emoji: "📁",
      shortcutLabel: filesWorkspace,
      description: `Open the file tree and editor for the active worktree (${filesWorkspace} from the workspace, or ⌘3 with the launcher open).`,
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
      emoji: "💬",
      shortcutLabel: "⌘4",
      description:
        "Limit the list below to threads in this worktree; press again to clear the filter.",
      searchPrefix: "@threads",
      isFilter: true,
      filterId: "agents",
      action: () => toggleFilter("agents")
    },
    {
      id: "searchWorktrees",
      label: "Search Worktrees",
      emoji: "🌿",
      shortcutLabel: "⌘5",
      description:
        "Limit the list below to branch checkouts in this project; press again to clear the filter.",
      searchPrefix: "@branches",
      isFilter: true,
      filterId: "worktrees",
      action: () => toggleFilter("worktrees")
    },
    {
      id: "searchFiles",
      label: "Search Files",
      emoji: "🗂️",
      shortcutLabel: "⌘6",
      description: "Search files in the active worktree by path.",
      searchPrefix: "@files",
      isFilter: false,
      filterId: null,
      action: () => close()
    },
    {
      id: "sidebar",
      label: "Toggle Sidebar",
      emoji: "📌",
      shortcutLabel: "⌘B",
      description: "Show or hide the threads sidebar on the left.",
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
      emoji: "⚙️",
      shortcutLabel: "⌘S",
      description: "Open agent commands and keyboard shortcut settings.",
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
  const kb = useKeybindingsStore();
  const cc = createCommandCenter({
    ...ctx,
    centerPaneShortcutLabels: {
      agent: kb.shortcutLabelForId("focusAgentTab"),
      git: kb.shortcutLabelForId("focusGitPanel"),
      files: kb.shortcutLabelForId("focusFilesPanel")
    }
  });

  function onKeydown(ev: KeyboardEvent): void {
    if (!cc.isOpen.value) return;

    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      cc.close();
      return;
    }

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
    if (matchesScoped(ev, "Digit6")) {
      ev.preventDefault();
      cc.quickActions.find((a) => a.id === "searchFiles")?.action();
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
