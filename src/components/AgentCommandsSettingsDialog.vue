<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";

const props = defineProps<{
  open: boolean;
  /** Current saved commands (all four agents). */
  commands: Record<ThreadAgent, string>;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
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

type SettingsSection = "agents" | "terminal";
const activeSection = ref<SettingsSection>("agents");

const settingsPanelAgentsId = "workspace-settings-panel-agents";
const settingsPanelTerminalId = "workspace-settings-panel-terminal";

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

watch(
  () => props.open,
  async (isOpen) => {
    removeEscapeListener?.();
    removeEscapeListener = null;
    if (isOpen) {
      draft.value = { ...props.commands };
      activeSection.value = "agents";
      bindEscapeWhileOpen();
      await nextTick();
      panelRef.value?.focus();
    }
  }
);

watch(
  () => props.commands,
  (c) => {
    if (props.open) return;
    draft.value = { ...c };
  },
  { deep: true }
);

onBeforeUnmount(() => {
  removeEscapeListener?.();
});

function close(): void {
  emit("update:open", false);
}

function onBackdropPointerDown(event: MouseEvent): void {
  if (event.target === event.currentTarget) close();
}

function resetDraftToDefaults(): void {
  draft.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
}

function save(): void {
  emit("save", { ...draft.value });
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-[1px]"
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
