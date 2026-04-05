<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { PanelLeftClose, Plus } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import Badge from "@/components/ui/Badge.vue";
import { APP_DISPLAY_NAME } from "@/constants/appMeta";

withDefaults(
  defineProps<{
    /** Product name (serif) beside the Alpha badge. */
    title?: string;
  }>(),
  { title: APP_DISPLAY_NAME }
);

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  collapse: [];
}>();

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

const popoverOpen = ref(false);
const menuRootRef = ref<HTMLElement | null>(null);
const menuId = "thread-agent-menu";

function togglePopover(): void {
  popoverOpen.value = !popoverOpen.value;
}

function closePopover(): void {
  popoverOpen.value = false;
}

function pickAgent(agent: ThreadAgent): void {
  emit("createWithAgent", agent);
  closePopover();
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (!popoverOpen.value) return;
  const root = menuRootRef.value;
  if (root && !root.contains(event.target as Node)) {
    closePopover();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closePopover();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <header
    class="flex shrink-0 items-center gap-2 border-b border-border bg-muted/25 px-3 py-2 pr-1.5"
  >
    <h2
      class="m-0 flex min-w-0 flex-1 items-center gap-2 overflow-hidden p-0 text-foreground"
      data-testid="thread-sidebar-brand"
    >
      <span class="min-w-0 truncate font-instrument text-lg leading-none tracking-tight">{{ title }}</span>
      <Badge
        variant="secondary"
        class="h-5 shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider"
      >
        Alpha
      </Badge>
    </h2>
    <div class="flex shrink-0 items-center justify-end gap-1.5">
      <div ref="menuRootRef" class="relative">
        <BaseButton
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label="New thread"
          title="New thread"
          :aria-expanded="popoverOpen"
          :aria-controls="menuId"
          aria-haspopup="menu"
          @click="togglePopover"
        >
          <Plus class="h-3.5 w-3.5" />
        </BaseButton>
        <div
          v-show="popoverOpen"
          :id="menuId"
          class="absolute left-1/2 top-full z-50 mt-1 min-w-[22rem] -translate-x-1/2 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
          role="menu"
          aria-label="Choose agent for new thread"
        >
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="opt in AGENT_OPTIONS"
              :key="opt.agent"
              type="button"
              role="menuitem"
              :title="opt.label"
              class="flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-3 rounded-md p-1.5 text-center hover:bg-accent"
              @click="pickAgent(opt.agent)"
            >
              <AgentIcon :agent="opt.agent" :size="28" class="shrink-0" />
              <span class="w-full min-w-0 truncate text-[10px] leading-tight">{{ opt.label }}</span>
            </button>
          </div>
        </div>
      </div>
      <BaseButton
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label="Collapse threads sidebar"
        title="Collapse threads sidebar"
        @click="emit('collapse')"
      >
        <PanelLeftClose class="h-3.5 w-3.5" />
      </BaseButton>
    </div>
  </header>
</template>
