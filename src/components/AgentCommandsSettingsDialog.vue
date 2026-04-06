<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";
import { useColorScheme, type ColorSchemePreference } from "@/composables/useColorScheme";
import { uiThemePresetLabel, useUiThemePreset } from "@/composables/useUiThemePreset";
import {
  formatShortcut,
  KEYBINDING_DEFINITIONS,
  type KeybindingCategory
} from "@/keybindings/registry";

/** `v-model` visibility; avoid prop name `open` (Vue 3.5 boolean-attribute merge quirks). */
const modelValue = defineModel<boolean>({ default: false });

const props = defineProps<{
  /** Current saved commands (all four agents). */
  commands: Record<ThreadAgent, string>;
}>();

const emit = defineEmits<{
  save: [commands: Record<ThreadAgent, string>];
}>();

const AGENT_ROWS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

const draft = ref<Record<ThreadAgent, string>>({ ...props.commands });
const panelRef = ref<HTMLElement | null>(null);

type SettingsSection = "agents" | "terminal" | "appearance" | "keyboard";
const activeSection = ref<SettingsSection>("agents");

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

const keyboardBindingsGrouped = computed(() => {
  const map = new Map<KeybindingCategory, typeof KEYBINDING_DEFINITIONS>();
  for (const def of KEYBINDING_DEFINITIONS) {
    const list = map.get(def.category) ?? [];
    list.push(def);
    map.set(def.category, list);
  }
  return KEYBIND_CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
    category,
    rows: map.get(category)!
  }));
});

const {
  terminalNotificationsEnabled,
  terminalBellSound,
  terminalBackgroundOutputSound
} = useTerminalSoundSettings();

let removeEscapeListener: (() => void) | null = null;

function bindEscapeWhileOpen(): void {
  removeEscapeListener?.();
  const handler = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
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
  if (isOpen) {
    draft.value = { ...props.commands };
    activeSection.value = "agents";
    bindEscapeWhileOpen();
    await nextTick();
    panelRef.value?.focus();
  }
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
});

function close(): void {
  modelValue.value = false;
}

function onBackdropPointerDown(event: MouseEvent): void {
  if (event.target === event.currentTarget) close();
}

function resetDraftToDefaults(): void {
  draft.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
}

function save(): void {
  emit("save", { ...draft.value });
  modelValue.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-[1px]"
      role="presentation"
      @pointerdown="onBackdropPointerDown"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-settings-dialog-title"
        class="relative w-full max-w-xl rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg outline-none"
        tabindex="-1"
        @pointerdown.stop
      >
        <h2 id="workspace-settings-dialog-title" class="text-base font-semibold">Settings</h2>

        <div
          role="tablist"
          aria-label="Settings sections"
          class="mt-4 flex gap-1 border-b border-border"
        >
          <button
            id="settings-tab-agents"
            type="button"
            role="tab"
            :aria-selected="activeSection === 'agents'"
            :tabindex="activeSection === 'agents' ? 0 : -1"
            :aria-controls="settingsPanelAgentsId"
            class="relative -mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :class="
              activeSection === 'agents'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            @click="activeSection = 'agents'"
          >
            Agents
          </button>
          <button
            id="settings-tab-terminal"
            type="button"
            role="tab"
            :aria-selected="activeSection === 'terminal'"
            :tabindex="activeSection === 'terminal' ? 0 : -1"
            :aria-controls="settingsPanelTerminalId"
            class="relative -mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :class="
              activeSection === 'terminal'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            @click="activeSection = 'terminal'"
          >
            Terminal
          </button>
          <button
            id="settings-tab-appearance"
            type="button"
            role="tab"
            :aria-selected="activeSection === 'appearance'"
            :tabindex="activeSection === 'appearance' ? 0 : -1"
            :aria-controls="settingsPanelAppearanceId"
            class="relative -mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :class="
              activeSection === 'appearance'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            @click="activeSection = 'appearance'"
          >
            Appearance
          </button>
          <button
            id="settings-tab-keyboard"
            type="button"
            role="tab"
            :aria-selected="activeSection === 'keyboard'"
            :tabindex="activeSection === 'keyboard' ? 0 : -1"
            :aria-controls="settingsPanelKeyboardId"
            class="relative -mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :class="
              activeSection === 'keyboard'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            @click="activeSection = 'keyboard'"
          >
            Keyboard
          </button>
        </div>

        <div class="mt-4 min-h-[12rem]">
          <div
            v-show="activeSection === 'agents'"
            :id="settingsPanelAgentsId"
            role="tabpanel"
            aria-labelledby="settings-tab-agents"
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
          </div>

          <div
            v-show="activeSection === 'terminal'"
            :id="settingsPanelTerminalId"
            role="tabpanel"
            aria-labelledby="settings-tab-terminal"
          >
            <p class="text-sm text-muted-foreground">
              Short sounds when the integrated terminal needs your attention (bell character or output while you
              are on another tab or thread).
            </p>
            <div class="mt-3 space-y-2.5 text-sm">
              <label class="flex cursor-pointer items-start gap-2.5 select-none">
                <input
                  v-model="terminalNotificationsEnabled"
                  type="checkbox"
                  class="mt-0.5 size-3.5 shrink-0 rounded border-border accent-primary"
                />
                <span>Enable notifications</span>
              </label>
              <label class="flex cursor-pointer items-start gap-2.5 select-none">
                <input
                  v-model="terminalBellSound"
                  type="checkbox"
                  class="mt-0.5 size-3.5 shrink-0 rounded border-border accent-primary"
                />
                <span
                  >Bell (<kbd class="rounded bg-muted px-1 font-mono text-[0.65rem]">\a</kbd>)</span
                >
              </label>
              <label class="flex cursor-pointer items-start gap-2.5 select-none">
                <input
                  v-model="terminalBackgroundOutputSound"
                  type="checkbox"
                  class="mt-0.5 size-3.5 shrink-0 rounded border-border accent-primary"
                />
                <span>Background output (once until you view that terminal)</span>
              </label>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              Turn off <span class="font-medium text-foreground/80">Enable notifications</span> to silence all
              terminal attention sounds.
            </p>
          </div>

          <div
            v-show="activeSection === 'appearance'"
            :id="settingsPanelAppearanceId"
            role="tabpanel"
            aria-labelledby="settings-tab-appearance"
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
            aria-labelledby="settings-tab-keyboard"
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
                        <kbd
                          class="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-foreground"
                          >{{ formatShortcut(row.shortcut) }}</kbd
                        >
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
          class="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4"
          :class="activeSection === 'agents' ? 'justify-between' : 'justify-end'"
        >
          <BaseButton
            v-if="activeSection === 'agents'"
            type="button"
            variant="ghost"
            size="sm"
            @click="resetDraftToDefaults"
          >
            Reset to app defaults
          </BaseButton>
          <div class="flex gap-2">
            <BaseButton type="button" variant="outline" size="sm" @click="close"> Cancel </BaseButton>
            <BaseButton type="button" size="sm" @click="save"> Save </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
