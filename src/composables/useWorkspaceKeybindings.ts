import { onBeforeUnmount, onMounted, type Ref } from "vue";
import {
  eventMatchesShortcut,
  findDefinition,
  isFocusInsideInstrumentTerminal,
  isTypingSurface,
  KEYBINDING_DEFINITIONS,
  type KeybindingId,
  type PhysicalShortcut
} from "@/keybindings/registry";

const SHELL_TAB_CODES = ["Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"] as const;

const NAV_IDS: KeybindingId[] = [
  "centerTabAgent",
  "centerTabDiff",
  "centerTabFiles",
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
  shellSlotIds: () => readonly string[];
  onSelectCenterTab: (tab: string) => void;
  onPrevThread: () => void;
  onNextThread: () => void;
  onToggleSidebar: () => void;
  onOpenNewThreadMenu: () => void;
  onAddTerminal: () => void;
  onFocusFileSearch: () => void;
  onStageAllDiff: () => void;
  onOpenSettings: () => void;
};

function findStaticBindingId(ev: KeyboardEvent): KeybindingId | null {
  for (const d of KEYBINDING_DEFINITIONS) {
    if (d.id === "centerTabShellSlot") continue;
    if (eventMatchesShortcut(ev, d.shortcut)) return d.id;
  }
  return null;
}

function shellSlotIndexFromEvent(ev: KeyboardEvent, shellCount: number): number | null {
  if (ev.repeat || shellCount === 0) return null;
  const idx = SHELL_TAB_CODES.findIndex((c) => c === ev.code);
  if (idx < 0 || idx >= shellCount) return null;
  const shellShortcut: PhysicalShortcut = { mod: true, code: SHELL_TAB_CODES[idx] };
  if (!eventMatchesShortcut(ev, shellShortcut)) return null;
  return idx;
}

/**
 * Workspace shortcuts: not handled while the settings modal is open. Integrated terminal and
 * most text fields block navigation shortcuts; see `isTypingSurface` / terminal data attribute.
 */
export function useWorkspaceKeybindings(ctx: WorkspaceKeybindingContext, enabled: Ref<boolean>): void {
  function onKeydown(ev: KeyboardEvent): void {
    if (!enabled.value) return;
    if (ctx.settingsOpen()) return;

    const inTerminal = isFocusInsideInstrumentTerminal(ev.target);
    const typing = isTypingSurface(ev.target);
    const workspaceUi = ctx.workspaceUiActive();

    const id = findStaticBindingId(ev);
    const shellIdx = workspaceUi ? shellSlotIndexFromEvent(ev, ctx.shellSlotIds().length) : null;

    if (id === "openSettings") {
      const def = findDefinition("openSettings");
      if (def && eventMatchesShortcut(ev, def.shortcut)) {
        if (!inTerminal) {
          ev.preventDefault();
          ctx.onOpenSettings();
        }
      }
      return;
    }

    if (id == null && shellIdx == null) return;

    if (!workspaceUi) return;

    const def = id ? findDefinition(id) : null;

    if (def && NAV_IDS.includes(def.id) && inTerminal) return;

    if (def && NAV_IDS.includes(def.id) && typing) return;

    if (shellIdx != null) {
      if (inTerminal) return;
      if (typing) return;
      ev.preventDefault();
      const slotId = ctx.shellSlotIds()[shellIdx];
      if (slotId) ctx.onSelectCenterTab(`shell:${slotId}`);
      return;
    }

    if (!id || !def) return;
    if (!eventMatchesShortcut(ev, def.shortcut)) return;

    if (id === "centerTabAgent") {
      ev.preventDefault();
      ctx.onSelectCenterTab("agent");
      return;
    }
    if (id === "centerTabDiff") {
      ev.preventDefault();
      ctx.onSelectCenterTab("diff");
      return;
    }
    if (id === "centerTabFiles") {
      ev.preventDefault();
      ctx.onSelectCenterTab("files");
      return;
    }
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
      if (ctx.centerTab() !== "diff") return;
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
