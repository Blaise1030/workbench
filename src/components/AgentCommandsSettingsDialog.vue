<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";

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
        aria-labelledby="agent-commands-dialog-title"
        class="relative w-full max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg outline-none"
        tabindex="-1"
        @pointerdown.stop
      >
        <h2 id="agent-commands-dialog-title" class="text-base font-semibold">
          Agent terminal commands
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Command typed into the thread terminal when you start a new thread with each agent (then Enter is
          sent). Use the exact CLI you have on your PATH.
        </p>

        <div class="mt-4 space-y-3">
          <div v-for="row in AGENT_ROWS" :key="row.agent" class="space-y-1">
            <label
              class="flex items-center gap-2 text-sm font-medium"
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

        <div class="mt-6 flex flex-wrap items-center justify-between gap-2">
          <BaseButton type="button" variant="ghost" size="sm" @click="resetDraftToDefaults">
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
