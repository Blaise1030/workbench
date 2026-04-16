<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import Checkbox from "@/components/ui/Checkbox.vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { usePreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";
import type { TerminalActivitySensitivity } from "@/terminal/activitySensitivity";
import {
  conflictingBindingId,
  findDefinitionIn,
  formatBindingDisplay,
  KEYBINDING_DEFINITIONS,
  mergeKeybindingOverrides,
  physicalShortcutFromKeyboardEvent,
  type KeybindingDefinition,
  type KeybindingId
} from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const modelValue = defineModel<boolean>({ default: false });

const props = defineProps<{
  /** Current saved commands (all four agents). */
  commands: Record<ThreadAgent, string>;
}>();

const emit = defineEmits<{
  save: [payload: { commands: Record<ThreadAgent, string> }];
}>();

const AGENT_ROWS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

const draft = ref<Record<ThreadAgent, string>>({ ...props.commands });
const panelRef = ref<HTMLElement | null>(null);

const { preferredAgent, setPreferredAgent, syncFromStorage } = usePreferredThreadAgent();

type SettingsSection = "agents" | "terminal" | "keyboard";
const activeSection = ref<SettingsSection>("agents");
const settingsSectionTabs: readonly PillTabItem[] = [
  { value: "agents", label: "Agents" },
  { value: "terminal", label: "Terminal" },
  { value: "keyboard", label: "Keyboard" }
];

const settingsPanelAgentsId = "workspace-settings-panel-agents";
const settingsPanelTerminalId = "workspace-settings-panel-terminal";
const settingsPanelKeyboardId = "workspace-settings-panel-keyboard";

const KEYBIND_CATEGORY_ORDER: KeybindingDefinition["category"][] = [
  "Navigation",
  "Threads",
  "Git diff",
  "Files",
  "General"
];

const keybindings = useKeybindingsStore();

const definitionOrderIndex = new Map(
  KEYBINDING_DEFINITIONS.map((def, index) => [def.id, index] as const)
);

const categoryOrderIndex = new Map(
  KEYBIND_CATEGORY_ORDER.map((category, index) => [category, index] as const)
);

/** One flat list for the keyboard table (same order as before: category, then registry order). */
const keyboardBindingsRows = computed(() =>
  [...keybindings.effectiveDefinitions].filter((d) => !d.hidden).sort((a, b) => {
    const ca = categoryOrderIndex.get(a.category) ?? 99;
    const cb = categoryOrderIndex.get(b.category) ?? 99;
    if (ca !== cb) return ca - cb;
    return (definitionOrderIndex.get(a.id) ?? 0) - (definitionOrderIndex.get(b.id) ?? 0);
  })
);

const recordingKeybindingId = ref<KeybindingId | null>(null);
const recordError = ref<string | null>(null);
let removeRecordListener: (() => void) | null = null;

function stopRecording(): void {
  removeRecordListener?.();
  removeRecordListener = null;
  recordingKeybindingId.value = null;
  recordError.value = null;
}

function startRecording(id: KeybindingId): void {
  stopRecording();
  recordingKeybindingId.value = id;
  recordError.value = null;

  const handler = (e: KeyboardEvent): void => {
    if (recordingKeybindingId.value !== id) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      stopRecording();
      return;
    }
    const shortcut = physicalShortcutFromKeyboardEvent(e);
    if (!shortcut) return;
    const mergedOverrides = { ...keybindings.overrides, [id]: { shortcut } };
    const tentative = mergeKeybindingOverrides(KEYBINDING_DEFINITIONS, mergedOverrides);
    const conflict = conflictingBindingId(tentative, id, shortcut);
    if (conflict) {
      const label = findDefinitionIn(tentative, conflict)?.label ?? conflict;
      recordError.value = `Already used by “${label}”.`;
      return;
    }
    keybindings.setOverride(id, shortcut);
    stopRecording();
  };

  window.addEventListener("keydown", handler, true);
  removeRecordListener = () => {
    window.removeEventListener("keydown", handler, true);
    removeRecordListener = null;
  };
}

const { terminalNotificationsEnabled, terminalActivitySensitivity } = useTerminalSoundSettings();
const TERMINAL_ACTIVITY_SENSITIVITY_OPTIONS: {
  value: TerminalActivitySensitivity;
  label: string;
  hint: string;
}[] = [
  { value: "low", label: "Low", hint: "Any visible output counts as activity." },
  { value: "medium", label: "Medium", hint: "Requires short text, ignores tiny blips." },
  { value: "high", label: "High", hint: "Only substantial output counts as activity." }
];

let removeEscapeListener: (() => void) | null = null;

function bindEscapeWhileOpen(): void {
  removeEscapeListener?.();
  const handler = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      if (recordingKeybindingId.value) {
        e.preventDefault();
        e.stopPropagation();
        stopRecording();
        return;
      }
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", handler, true);
  removeEscapeListener = () => document.removeEventListener("keydown", handler, true);
}

watch(modelValue, async (isOpen) => {
  removeEscapeListener?.();
  removeEscapeListener = null;
  stopRecording();
  if (isOpen) {
    draft.value = { ...props.commands };
    syncFromStorage();
    activeSection.value = "agents";
    bindEscapeWhileOpen();
    await nextTick();
    panelRef.value?.focus();
  }
});

watch(activeSection, () => {
  stopRecording();
});

watch(
  () => props.commands,
  (c) => {
    if (modelValue.value) return;
    draft.value = { ...c };
  },
  { deep: true }
);

onBeforeUnmount(() => {
  removeEscapeListener?.();
  stopRecording();
});

function close(): void {
  modelValue.value = false;
}

function resetDraftToDefaults(): void {
  draft.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
}

function save(): void {
  emit("save", { commands: { ...draft.value } });
  modelValue.value = false;
}
</script>

<template>
  <Dialog :open="modelValue" @update:open="(open) => (modelValue = open)">
    <DialogContent
      ref="panelRef"
      aria-labelledby="workspace-settings-dialog-title"
      class="ui-glass-panel top-[10vh] flex max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-4xl translate-y-0 flex-col overflow-hidden p-0 text-card-foreground outline-none"
    >
      <DialogHeader class="shrink-0 px-4 pt-4">
        <DialogTitle id="workspace-settings-dialog-title" class="flex items-center gap-2 text-base">
          <span aria-hidden="true" class="select-none text-lg leading-none">⚙️</span>
          Settings
        </DialogTitle>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
          Configure agents, terminal, and keyboard settings. Agent commands require Save; other changes apply instantly.
        </p>

        <div class="border rounded-lg w-fit">
          <PillTabs
            v-model="activeSection"
            aria-label="Settings sections"
            :tabs="settingsSectionTabs"
            size="md"
          />
        </div>
      </DialogHeader>

        <div
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          data-testid="workspace-settings-scroll-body"
        >
          <div
            v-show="activeSection === 'agents'"
            :id="settingsPanelAgentsId"
            role="tabpanel"
            aria-label="Agents settings"
          >
            <p class="text-sm leading-relaxed text-muted-foreground">
              When you start a thread, Instrument types the command below into that thread’s terminal and sends Enter
              for you. Use the same executable name you would run in a normal shell (it must be on your
              <span class="whitespace-nowrap font-mono text-[13px] text-foreground/90">PATH</span>).
            </p>

            <div class="mt-3 space-y-3">
              <div v-for="row in AGENT_ROWS" :key="row.agent" class="space-y-1">
                <label
                  class="flex items-center gap-2 text-sm font-medium text-foreground"
                  :for="`agent-cmd-${row.agent}`"
                >
                  <AgentIcon :agent="row.agent" :size="18" class="shrink-0 opacity-90" />
                  {{ row.label }}
                </label>
                <input
                  :id="`agent-cmd-${row.agent}`"
                  v-model="draft[row.agent]"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>

            <div class="mt-6 border-t border-border pt-4">
              <label class="mb-1 block text-sm font-medium text-foreground" for="preferred-thread-agent"
                >Default agent for new threads</label
              >
              <p class="mb-2 text-xs text-muted-foreground">
                Pre-selected in the add-thread overlay. You can still pick another agent before starting.
              </p>
              <Select
                id="preferred-thread-agent"
                :model-value="preferredAgent"
                @update:model-value="(v) => setPreferredAgent(v as ThreadAgent)"
              >
                <SelectTrigger class="h-9 w-full max-w-md bg-background text-sm sm:max-w-lg">
                  <SelectValue placeholder="Choose agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="row in AGENT_ROWS" :key="row.agent" :value="row.agent">
                    <span class="flex items-center gap-2">
                      <AgentIcon :agent="row.agent" :size="16" class="shrink-0" />
                      {{ row.label }}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            v-show="activeSection === 'terminal'"
            :id="settingsPanelTerminalId"
            role="tabpanel"
            aria-label="Terminal settings"
          >
            <p class="text-sm leading-relaxed text-muted-foreground">
              Optional audio feedback: terminal bell, output while this workspace is in the background, and when a
              thread goes idle after activity. Threads that may need your attention are highlighted until you open
              them.
            </p>
            <div class="mt-3 flex items-start gap-2.5 text-sm">
              <Checkbox
                id="settings-terminal-notifications"
                v-model="terminalNotificationsEnabled"
                class="mt-0.5"
              />
              <label
                class="cursor-pointer leading-snug text-foreground select-none"
                for="settings-terminal-notifications"
              >
                Enable notifications
              </label>
            </div>
            <div class="mt-4 space-y-1.5">
              <label class="block text-sm font-medium text-foreground" for="settings-terminal-sensitivity">
                Activity sensitivity
              </label>
              <p class="text-xs text-muted-foreground">
                Controls when output is treated as activity for both idle highlighting and away-tab sounds.
              </p>
              <Select
                id="settings-terminal-sensitivity"
                :model-value="terminalActivitySensitivity"
                @update:model-value="
                  (v) => (terminalActivitySensitivity = v as TerminalActivitySensitivity)
                "
              >
                <SelectTrigger class="h-9 w-full max-w-md bg-background text-sm sm:max-w-lg">
                  <SelectValue placeholder="Choose sensitivity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in TERMINAL_ACTIVITY_SENSITIVITY_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    <span class="flex flex-col">
                      <span>{{ opt.label }}</span>
                      <span class="text-xs text-muted-foreground">{{ opt.hint }}</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            v-show="activeSection === 'keyboard'"
            :id="settingsPanelKeyboardId"
            role="tabpanel"
            aria-label="Keyboard settings"
          >
            <p class="text-sm leading-relaxed text-muted-foreground">
              Workspace shortcuts are paused while this dialog is open. With the workspace focused, most navigation
              shortcuts are also skipped when you are typing in the integrated terminal, search, agent fields, or the
              editor—click a shortcut cell to record a new chord, or Reset row to restore one binding.
            </p>
            <div class="mt-4 overflow-x-auto">
              <table class="w-full min-w-[20rem] border-collapse text-left text-sm">
                <thead>
                  <tr class="border-b border-border text-muted-foreground">
                    <th class="py-1.5 pr-3 font-medium">Action</th>
                    <th class="py-1.5 font-medium">Shortcut</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in keyboardBindingsRows"
                    :key="row.id"
                    class="border-b border-border/60 align-top"
                  >
                    <td class="py-2 pr-3 text-foreground">{{ row.label }}</td>
                    <td class="py-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          class="max-w-full rounded border border-transparent bg-muted/50 px-1.5 py-0.5 text-left font-mono text-xs text-foreground transition-colors hover:bg-muted"
                          :class="
                            recordingKeybindingId === row.id
                              ? 'ring-2 ring-ring ring-offset-2 ring-offset-card'
                              : ''
                          "
                          @click="startRecording(row.id)"
                        >
                          {{ formatBindingDisplay(row) }}
                          <span
                            v-if="recordingKeybindingId === row.id"
                            class="ml-2 inline-block font-sans text-[11px] font-normal text-muted-foreground"
                          >
                            Press new shortcut… Esc cancels
                          </span>
                        </button>
                        <Button
                          v-if="keybindings.overrides[row.id]"
                          type="button"
                          variant="ghost"
                          size="sm"
                          class="h-7 px-2 text-xs"
                          @click="keybindings.clearOverride(row.id)"
                        >
                          Reset row
                        </Button>
                      </div>
                      <p
                        v-if="recordingKeybindingId === row.id && recordError"
                        class="mt-1 max-w-sm text-xs text-destructive"
                      >
                        {{ recordError }}
                      </p>
                      <p v-if="row.notes" class="mt-1 max-w-sm text-xs text-muted-foreground">
                        {{ row.notes }}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          class="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-4"
          :class="
            activeSection === 'agents' || activeSection === 'keyboard' ? 'justify-between' : 'justify-end'
          "
        >
          <Button
            v-if="activeSection === 'agents'"
            type="button"
            variant="outline"
            size="sm"
            @click="resetDraftToDefaults"
          >
            Reset to app defaults
          </Button>
          <Button
            v-if="activeSection === 'keyboard'"
            type="button"
            variant="outline"
            size="sm"
            @click="keybindings.resetAll()"
          >
            Reset keyboard to defaults
          </Button>
          <div class="flex gap-2">
            <Button type="button" variant="outline" size="sm" @click="close"> Cancel </Button>
            <Button type="button" size="sm" @click="save"> Save </Button>
          </div>
        </div>
    </DialogContent>
  </Dialog>
</template>
