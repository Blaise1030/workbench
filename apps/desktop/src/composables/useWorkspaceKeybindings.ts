import { onBeforeUnmount, onMounted, type Ref } from "vue";
import {
  eventMatchesBinding,
  eventMatchesShortcut,
  findDefinitionIn,
  isFocusInsideInstrumentTerminal,
  isTypingSurface,
  MOD_DIGIT_SLOT_CODES,
  type KeybindingDefinition,
  type KeybindingId,
  type PhysicalShortcut
} from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const NAV_IDS: KeybindingId[] = [
  "prevThread",
  "nextThread",
  "toggleThreadSidebar",
  "newThreadMenu",
  "addTerminal",
  "focusFileSearch",
  "stageAllDiff"
];

export type WorkspaceKeybindingContext = {
  /** Thread + worktree UI visible */
  workspaceUiActive: () => boolean;
  settingsOpen: () => boolean;
  centerTab: () => string;
  /** Project ids in tab order; first nine get ⌘1–⌘9. */
  projectIds: () => readonly string[];
  shellSlotIds: () => readonly string[];
  /** Bottom shell overlay / bar visible (⌘J). When true and focus is in a terminal, ⌘1–⌘9 switch shell tabs only. */
  terminalPanelOpen: () => boolean;
  /** When false, stage-all shortcut on diff tab is ignored. */
  scmActionsAvailable: () => boolean;
  onSelectProject: (projectId: string) => void;
  onSelectCenterTab: (tab: string) => void;
  onPrevThread: () => void;
  onNextThread: () => void;
  onToggleSidebar: () => void;
  onOpenNewThreadMenu: () => void;
  onAddTerminal: () => void;
  /** Toggle bottom terminal panel visibility (⌘J); should work while focus is in the terminal. */
  onToggleTerminalPanel: () => void;
  onFocusFileSearch: () => void;
  /** Toggle Raycast-style workspace search; may fire while the launcher input is focused. */
  onToggleWorkspaceLauncher: () => void;
  onStageAllDiff: () => void;
  onOpenSettings: () => void;
  /** When true, suppress other workspace shortcuts (launcher open). Launcher toggle still works. */
  launcherConsumesNavShortcuts?: () => boolean;
};

function findStaticBindingId(ev: KeyboardEvent, definitions: KeybindingDefinition[]): KeybindingId | null {
  for (const d of definitions) {
    if (eventMatchesBinding(ev, d)) return d.id;
  }
  return null;
}

/** 0–8 for ⌘1…⌘9 when Mod+digit (no shift/alt); else null. */
function modDigitSlotIndex(ev: KeyboardEvent): number | null {
  const idx = MOD_DIGIT_SLOT_CODES.findIndex((c) => c === ev.code);
  if (idx < 0) return null;
  const s: PhysicalShortcut = { mod: true, code: MOD_DIGIT_SLOT_CODES[idx] };
  if (!eventMatchesShortcut(ev, s)) return null;
  return idx;
}

/**
 * Workspace shortcuts: not handled while the settings modal is open. Integrated terminal and
 * most text fields block navigation shortcuts; see `isTypingSurface` / terminal data attribute.
 */
export function useWorkspaceKeybindings(ctx: WorkspaceKeybindingContext, enabled: Ref<boolean>): void {
  const keybindings = useKeybindingsStore();

  function onKeydown(ev: KeyboardEvent): void {
    if (!enabled.value) return;
    if (ctx.settingsOpen()) return;

    const definitions = keybindings.effectiveDefinitions;
    const inTerminal = isFocusInsideInstrumentTerminal(ev.target);
    const typing = isTypingSurface(ev.target);
    const workspaceUi = ctx.workspaceUiActive();

    const digitSlot = workspaceUi ? modDigitSlotIndex(ev) : null;
    const id = findStaticBindingId(ev, definitions);

    if (ctx.launcherConsumesNavShortcuts?.()) {
      if (workspaceUi && id === "workspaceLauncher") {
        const def = findDefinitionIn(definitions, "workspaceLauncher");
        if (def && eventMatchesShortcut(ev, def.shortcut)) {
          ev.preventDefault();
          ctx.onToggleWorkspaceLauncher();
        }
      }
      return;
    }

    if (digitSlot != null && workspaceUi) {
      const panelOpen = ctx.terminalPanelOpen();
      // While focus is inside the integrated terminal, global ⌘1…⌘9 project/shell routing
      // is suppressed — unless the bottom terminal panel is open, in which case ⌘1…⌘n
      // select Terminal 1…n (shell tabs only).
      if (panelOpen && inTerminal) {
        const shells = ctx.shellSlotIds();
        if (digitSlot < shells.length) {
          ev.preventDefault();
          const slotId = shells[digitSlot];
          if (slotId) ctx.onSelectCenterTab(`shell:${slotId}`);
        }
        return;
      }

      if (!inTerminal && !typing) {
        const projects = ctx.projectIds();
        const projectSlots = Math.min(MOD_DIGIT_SLOT_CODES.length, projects.length);
        if (digitSlot < projectSlots) {
          const pid = projects[digitSlot];
          if (pid) {
            ev.preventDefault();
            ctx.onSelectProject(pid);
          }
          return;
        }
        const shellIdx = digitSlot - projectSlots;
        const shells = ctx.shellSlotIds();
        if (shellIdx >= 0 && shellIdx < shells.length) {
          ev.preventDefault();
          const slotId = shells[shellIdx];
          if (slotId) ctx.onSelectCenterTab(`shell:${slotId}`);
          return;
        }
      }
    }

    if (id === "openSettings") {
      const def = findDefinitionIn(definitions, "openSettings");
      if (def && eventMatchesShortcut(ev, def.shortcut)) {
        if (!inTerminal) {
          ev.preventDefault();
          ctx.onOpenSettings();
        }
      }
      return;
    }

    if (id == null) return;

    if (!workspaceUi) return;

    if (id === "workspaceLauncher") {
      const def = findDefinitionIn(definitions, "workspaceLauncher");
      if (def && eventMatchesShortcut(ev, def.shortcut)) {
        ev.preventDefault();
        ctx.onToggleWorkspaceLauncher();
      }
      return;
    }

    if (id === "toggleTerminalPanel") {
      const def = findDefinitionIn(definitions, "toggleTerminalPanel");
      if (def && eventMatchesBinding(ev, def)) {
        ev.preventDefault();
        ctx.onToggleTerminalPanel();
      }
      return;
    }

    const def = findDefinitionIn(definitions, id);

    if (def && NAV_IDS.includes(def.id) && inTerminal) return;

    if (def && NAV_IDS.includes(def.id) && typing) return;

    if (!def) return;
    if (!eventMatchesBinding(ev, def)) return;

    if (id === "prevThread") {
      ev.preventDefault();
      ctx.onPrevThread();
      return;
    }
    if (id === "nextThread") {
      ev.preventDefault();
      ctx.onNextThread();
      return;
    }
    if (id === "toggleThreadSidebar") {
      ev.preventDefault();
      ctx.onToggleSidebar();
      return;
    }
    if (id === "newThreadMenu") {
      ev.preventDefault();
      ctx.onOpenNewThreadMenu();
      return;
    }
    if (id === "addTerminal") {
      ev.preventDefault();
      ctx.onAddTerminal();
      return;
    }
    if (id === "focusFileSearch") {
      ev.preventDefault();
      ctx.onFocusFileSearch();
      return;
    }
    if (id === "stageAllDiff") {
      if (ctx.centerTab() !== "diff" || !ctx.scmActionsAvailable()) return;
      ev.preventDefault();
      ctx.onStageAllDiff();
      return;
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeydown, { capture: true });
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown, { capture: true });
  });
}
