<script setup lang="ts">
import type { ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import PromptWithFileAttachments from "@/components/PromptWithFileAttachments.vue";
import {Button} from "@/components/ui/button";;
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import type { LocalFileAttachment } from "@/lib/localFileAttachment";
import ditherDarkImage from "@/assets/thread-inline-prompt-dither-dark.png";
import ditherLightImage from "@/assets/thread-inline-prompt-dither-light.png";

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
/** Branch / worktree label from parent (reactive with checkout and worktree metadata). */
const threadTargetLabel = computed(() => {
  const raw = props.threadContextLabel?.trim();
  if (raw) return raw;
  return "this worktree";
});
const selectedAgent = ref<ThreadAgent>(preferredAgent.value);
const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((o) => o.agent === selectedAgent.value)?.label ?? ""
);
const prompt = ref("");
const attachments = ref<LocalFileAttachment[]>([]);
const skillPaths = ref<string[]>([]);
const isDarkTheme = ref(false);

const promptEditorRef = ref<{ flushToModels: () => void } | null>(null);
let themeObserver: MutationObserver | null = null;

const ditherImageSrc = computed(() => (isDarkTheme.value ? ditherDarkImage : ditherLightImage));

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function buildPromptWithAttachmentBlocks(text: string): string {
  const parts: string[] = [];
  const note = text.trim();
  if (note) parts.push(note);

  const nextSkills = dedupe(skillPaths.value);
  const nextFiles = dedupe(attachments.value.map((a) => a.path));

  if (nextSkills.length > 0) {
    parts.push(`[Attached skills]\n${nextSkills.join("\n")}`);
  }
  if (nextFiles.length > 0) {
    parts.push(`[Attached files]\n${nextFiles.join("\n")}`);
  }

  return parts.join("\n\n").trim();
}

function startThread(): void {
  promptEditorRef.value?.flushToModels();
  const finalPrompt = buildPromptWithAttachmentBlocks(prompt.value);
  emit("submit", { agent: selectedAgent.value, prompt: finalPrompt });
}

function submit(): void {
  startThread();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  emit("cancel");
}

onMounted(() => {
  isDarkTheme.value = document.documentElement.classList.contains("dark");
  themeObserver = new MutationObserver(() => {
    isDarkTheme.value = document.documentElement.classList.contains("dark");
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });

  window.addEventListener("keydown", onKeyDown, { capture: true });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  window.removeEventListener("keydown", onKeyDown, { capture: true });
});

defineExpose({ submit });
</script>

<template>
  <section
    data-testid="inline-prompt-editor"
    class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
  >
    <div
      aria-hidden="true"
      class="thread-inline-prompt-editor__shader pointer-events-none absolute inset-y-0 right-0 overflow-hidden"
    >
      <img
        :src="ditherImageSrc"
        alt=""
        :class="[
          'h-full w-full object-cover object-left',
          isDarkTheme ? 'invert' : undefined
        ]"
      />
    </div>

    <div class="relative z-10 flex flex-1 items-center justify-center p-6">
      <div class="w-full max-w-5xl">
        <h2 class="mb-6 w-full text-center text-3xl text-foreground">
          Building something great ? <span aria-hidden="true">🛠️</span>
        </h2>

        <div
          class="relative mx-auto max-w-xl overflow-hidden rounded-xl border border-input bg-muted/50 px-2 pt-2"
        >
          <PromptWithFileAttachments
            ref="promptEditorRef"
            v-model:prompt="prompt"
            v-model:attachments="attachments"
            v-model:skill-paths="skillPaths"
            test-id-prefix="inline-prompt"
            :tiptap="true"                    
            :show-done-button="false"
            :worktree-path="worktreePath"
            placeholder="Use @ for files or / for skills..."
          >
            <template #footer>
              <div class="flex flex-col items-center gap-2 py-1 w-full">                
                <div class="ms-auto flex flex-wrap items-center gap-2">
                  <Select v-model="selectedAgent" data-testid="inline-prompt-agent-select">
                    <SelectTrigger class="h-8 max-h-8 w-[11rem] bg-background text-sm">
                      <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <AgentIcon :agent="selectedAgent" :size="16" class="shrink-0" />
                        <SelectValue placeholder="Choose agent">{{ selectedAgentLabel }}</SelectValue>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in AGENT_OPTIONS" :key="opt.agent" :value="opt.agent">
                        <span class="flex items-center gap-2">
                          <AgentIcon :agent="opt.agent" :size="16" class="shrink-0" />
                          {{ opt.label }}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"                    
                    data-testid="inline-prompt-cancel"
                    @click="$emit('cancel')"
                  >
                    Cancel
                  </Button>

                  <Button
                    type="button"                    
                    data-testid="inline-prompt-start-thread"
                    @click="startThread"
                  >
                    Start thread
                  </Button>
                </div>                
              </div>
            </template>
          </PromptWithFileAttachments>           
        </div>        
          <div class="text-xs text-center py-4 text-muted-foreground">
            You are adding a thread to <b>{{ threadTargetLabel }}</b>.
          </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.thread-inline-prompt-editor__shader {
  opacity: 1;
  animation: thread-inline-prompt-editor-fade-in 1000ms ease-out both;
}

@keyframes thread-inline-prompt-editor-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
