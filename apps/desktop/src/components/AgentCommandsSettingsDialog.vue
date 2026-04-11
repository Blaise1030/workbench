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
import { useColorScheme, type ColorSchemePreference } from "@/composables/useColorScheme";
import { uiThemePresetLabel, useUiThemePreset } from "@/composables/useUiThemePreset";
import {
  conflictingBindingId,
  findDefinitionIn,
  formatBindingDisplay,
  KEYBINDING_DEFINITIONS,
  mergeKeybindingOverrides,
  physicalShortcutFromKeyboardEvent,
  type KeybindingCategory,
  type KeybindingDefinition,
  type KeybindingId
} from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

/** `v-model` visibility; avoid prop name `open` (Vue 3.5 boolean-attribute merge quirks). */
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

type SettingsSection = "agents" | "terminal" | "appearance" | "keyboard";
const activeSection = ref<SettingsSection>("agents");
const settingsSectionTabs: readonly PillTabItem[] = [
  { value: "agents", label: "Agents" },
  { value: "terminal", label: "Terminal" },
  { value: "appearance", label: "Appearance" },
  { value: "keyboard", label: "Keyboard" }
];

const settingsPanelAgentsId = "workspace-settings-panel-agents";
const settingsPanelTerminalId = "workspace-settings-panel-terminal";
const settingsPanelAppearanceId = "workspace-settings-panel-appearance";
const settingsPanelKeyboardId = "workspace-settings-panel-keyboard";

const { preference: colorSchemePreference, resolvedIsDark: appearancePreviewIsDark } = useColorScheme();
const { preset: uiThemePreset, presets: uiThemePresetIds } = useUiThemePreset();

const COLOR_SCHEME_OPTIONS: { value: ColorSchemePreference; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always use light chrome" },
  { value: "dark", label: "Dark", hint: "Always use dark chrome" },
  { value: "system", label: "System", hint: "Match macOS / Windows appearance" }
];

const KEYBIND_CATEGORY_ORDER: KeybindingCategory[] = [
  "Navigation",
  "Threads",
  "Git diff",
  "Files",
  "General"
];

const keybindings = useKeybindingsStore();

const keyboardBindingsGrouped = computed(() => {
  const map = new Map<KeybindingCategory, KeybindingDefinition[]>();
  for (const def of keybindings.effectiveDefinitions) {
    const list = map.get(def.category) ?? [];
    list.push(def);
    map.set(def.category, list);
  }
  return KEYBIND_CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
    category,
    rows: map.get(category)!
  }));
});

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
  if (id === "switchProjectOrTerminalDigit") return;
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
      class="ui-glass-panel top-[10vh] flex max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-xl translate-y-0 flex-col overflow-hidden p-0 text-card-foreground outline-none"
    >
      <DialogHeader class="shrink-0 px-4 pt-4">
        <DialogTitle id="workspace-settings-dialog-title" class="text-base">Settings</DialogTitle>

        <div class="mt-4">
          <PillTabs
            v-model="activeSection"
            aria-label="Settings sections"
            :tabs="settingsSectionTabs"
            size="default"
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
            <p class="text-sm text-muted-foreground">
              Command typed into the thread terminal when you start a new thread with each agent (then Enter is
              sent). Use the exact CLI you have on your PATH.
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
                <SelectTrigger class="h-9 w-full max-w-sm bg-background text-sm">
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
            <p class="text-sm text-muted-foreground">
              Short sounds for terminal bell, output while you're on another tab or thread, or when a thread goes
              idle after activity. Idle threads are highlighted in blue until you open them.
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
                <SelectTrigger class="h-9 w-full max-w-sm bg-background text-sm">
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
            v-show="activeSection === 'appearance'"
            :id="settingsPanelAppearanceId"
            role="tabpanel"
            aria-label="Appearance settings"
          >
            <p class="text-sm text-muted-foreground">
              Color mode and accent presets use the same design tokens as the rest of the app. Changes apply
              immediately.
            </p>

            <fieldset class="mt-4 space-y-2">
              <legend class="text-sm font-medium text-foreground">Color mode</legend>
              <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label
                  v-for="opt in COLOR_SCHEME_OPTIONS"
                  :key="opt.value"
                  class="flex min-w-0 cursor-pointer flex-col gap-2 rounded-md border border-border p-2.5 transition-colors select-none hover:bg-muted/30"
                  :class="
                    colorSchemePreference === opt.value
                      ? 'bg-muted/25 ring-2 ring-ring/60 ring-offset-2 ring-offset-card'
                      : ''
                  "
                >
                  <div class="flex items-center gap-2">
                    <input
                      v-model="colorSchemePreference"
                      type="radio"
                      name="settings-color-scheme"
                      class="size-3.5 shrink-0 rounded-full border-border accent-primary"
                      :value="opt.value"
                    />
                    <span class="text-sm font-medium text-foreground">{{ opt.label }}</span>
                  </div>
                  <p class="text-xs leading-snug text-muted-foreground">{{ opt.hint }}</p>
                </label>
              </div>
            </fieldset>

            <fieldset class="mt-5 space-y-2">
              <legend class="text-sm font-medium text-foreground">Theme</legend>
              <p class="text-xs text-muted-foreground">
                Previews reflect the color mode chosen above. Accents apply to buttons, focus rings, and sidebar
                highlights. You can still tune colors in
                <a
                  class="text-primary underline underline-offset-2 hover:opacity-90"
                  href="https://tweakcn.com/editor/theme"
                  target="_blank"
                  rel="noopener noreferrer"
                  >tweakcn</a
                >
                and merge variables into the app later.
              </p>
              <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label
                  v-for="id in uiThemePresetIds"
                  :key="id"
                  class="flex min-w-0 cursor-pointer flex-col gap-2 rounded-md border border-border p-2.5 transition-colors select-none hover:bg-muted/30"
                  :class="
                    uiThemePreset === id
                      ? 'bg-muted/25 ring-2 ring-ring/60 ring-offset-2 ring-offset-card'
                      : ''
                  "
                >
                  <div class="flex items-center gap-2">
                    <input
                      v-model="uiThemePreset"
                      type="radio"
                      name="settings-ui-theme-preset"
                      class="size-3.5 shrink-0 rounded-full border-border accent-primary"
                      :value="id"
                    />
                    <span class="min-w-0 truncate text-sm font-medium text-foreground">{{
                      uiThemePresetLabel(id)
                    }}</span>
                  </div>
                  <div
                    class="settings-theme-preview h-[3.25rem] w-full rounded-md"
                    :class="{ 'settings-theme-preview--dark': appearancePreviewIsDark }"
                    :data-settings-theme-preview-preset="id"
                    aria-hidden="true"
                  >
                    <div class="settings-theme-preview__rail">
                      <div class="settings-theme-preview__rail-mark" />
                    </div>
                    <div class="settings-theme-preview__main">
                      <div class="settings-theme-preview__bar" />
                      <div class="settings-theme-preview__row">
                        <span class="settings-theme-preview__pill" />
                        <span class="settings-theme-preview__danger" />
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>
          </div>

          <div
            v-show="activeSection === 'keyboard'"
            :id="settingsPanelKeyboardId"
            role="tabpanel"
            aria-label="Keyboard settings"
          >
            <p class="text-sm text-muted-foreground">
              Shortcuts are disabled while this dialog is open. Most shortcuts are ignored when focus is in the
              integrated terminal or in a text field (search, agent command inputs, code editor).
            </p>
            <div class="mt-4 space-y-5">
              <div v-for="group in keyboardBindingsGrouped" :key="group.category">
                <h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {{ group.category }}
                </h3>
                <table class="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr class="border-b border-border text-muted-foreground">
                      <th class="py-1.5 pr-3 font-medium">Action</th>
                      <th class="py-1.5 font-medium">Shortcut</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in group.rows"
                      :key="row.id"
                      class="border-b border-border/60 align-top"
                    >
                      <td class="py-2 pr-3 text-foreground">{{ row.label }}</td>
                      <td class="py-2">
                        <div v-if="row.id !== 'switchProjectOrTerminalDigit'" class="flex flex-wrap items-center gap-2">
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
                        <kbd
                          v-else
                          class="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-foreground"
                          >{{ formatBindingDisplay(row) }}</kbd
                        >
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
            variant="ghost"
            size="sm"
            @click="resetDraftToDefaults"
          >
            Reset to app defaults
          </Button>
          <Button
            v-if="activeSection === 'keyboard'"
            type="button"
            variant="ghost"
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
