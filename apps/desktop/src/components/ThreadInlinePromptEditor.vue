<script setup lang="ts">
import type { ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import { computed, onBeforeUnmount, onMounted } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import Button from "@/components/ui/Button.vue";
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

const props = withDefaults(
  defineProps<{
    worktreeId: string;
    worktreePath: string | null;
    threadContextLabel?: string | null;
    defaultAgent?: ThreadAgent;
  }>(),
  { defaultAgent: undefined, threadContextLabel: null }
);

const emit = defineEmits<{
  submit: [payload: ThreadCreateWithAgentPayload];
  cancel: [];
}>();

const preferredAgent = computed(() => props.defaultAgent ?? readPreferredThreadAgent());

function startAgent(agent: ThreadAgent): void {
  emit("submit", { agent, prompt: "" });
}

function submit(): void {
  startAgent(preferredAgent.value);
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  emit("cancel");
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown, { capture: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown, { capture: true });
});

defineExpose({ submit });
</script>

<template>
  <section
    data-testid="inline-prompt-editor"
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
  >
    <div class="flex flex-1 items-center justify-center p-6">
      <div class="w-full max-w-xl">
        <h2 class="mb-6 w-full text-center text-3xl text-foreground">
          Building something great ? <span aria-hidden="true">🛠️</span>
        </h2>
        <div class="grid grid-cols-4 gap-2">
          <Button
            v-for="opt in AGENT_OPTIONS"
            :key="opt.agent"
            type="button"
            variant="outline"
            size="sm"
            class="flex cursor-pointer aspect-square h-auto w-full flex-col items-center justify-center gap-2 rounded-xl text-center"
            :aria-label="`Start ${opt.label}`"
            :data-testid="`inline-prompt-agent-${opt.agent}`"
            @click="startAgent(opt.agent)"
          >
            <AgentIcon :agent="opt.agent" class="shrink-0 size-8" />
            <span>{{ opt.label }}</span>
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
