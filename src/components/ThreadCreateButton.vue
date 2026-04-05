<script lang="ts">
import { titleWithShortcut } from "@/keybindings/registry";

/** Module scope: withDefaults cannot reference <script setup> locals (defineProps is hoisted). */
export const threadCreateButtonDefaultTitle = titleWithShortcut(
  "New thread",
  "newThreadMenu"
);
</script>

<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

withDefaults(
  defineProps<{
    ariaLabel?: string;
    title?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon" | "xs" | "icon-xs";
  }>(),
  {
    ariaLabel: "New thread",
    title: threadCreateButtonDefaultTitle,
    variant: "outline",
    size: "icon-xs"
  }
);

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
}>();

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

const popoverOpen = ref(false);
const triggerWrapRef = ref<HTMLElement | null>(null);
const menuPanelRef = ref<HTMLElement | null>(null);
const menuId = `thread-agent-menu-${useId()}`;

/** Teleport the picker because the sidebar is narrower than the menu. */
const floatingMenuStyle = ref<Record<string, string>>({});

let removeRepositionListeners: (() => void) | null = null;

function updateFloatingPosition(): void {
  const el = triggerWrapRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const sidebarRect = el.closest("aside")?.getBoundingClientRect();
  const gap = 4;
  const minMenuWidthPx = 280;
  const widthPx = sidebarRect
    ? Math.max(minMenuWidthPx, sidebarRect.width * 0.9)
    : undefined;
  floatingMenuStyle.value = {
    top: `${rect.bottom + gap}px`,
    left: `${rect.left + rect.width / 2}px`,
    transform: "translateX(-50%)",
    width: widthPx != null ? `${widthPx}px` : "22rem"
  };
}

function bindRepositionWhileOpen(): void {
  removeRepositionListeners?.();
  const handler = (): void => {
    if (popoverOpen.value) updateFloatingPosition();
  };
  window.addEventListener("resize", handler);
  window.addEventListener("scroll", handler, true);
  removeRepositionListeners = () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("scroll", handler, true);
  };
}

function unbindReposition(): void {
  removeRepositionListeners?.();
  removeRepositionListeners = null;
}

watch(popoverOpen, async (open) => {
  if (open) {
    await nextTick();
    updateFloatingPosition();
    bindRepositionWhileOpen();
  } else {
    unbindReposition();
  }
});

function togglePopover(): void {
  popoverOpen.value = !popoverOpen.value;
}

function closePopover(): void {
  popoverOpen.value = false;
}

function openMenu(): void {
  if (popoverOpen.value) return;
  popoverOpen.value = true;
}

defineExpose({ openMenu });

function pickAgent(agent: ThreadAgent): void {
  emit("createWithAgent", agent);
  closePopover();
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (!popoverOpen.value) return;
  const target = event.target as Node;
  if (triggerWrapRef.value?.contains(target) || menuPanelRef.value?.contains(target)) return;
  closePopover();
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closePopover();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  unbindReposition();
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <div ref="triggerWrapRef" class="relative">
    <BaseButton
      type="button"
      :size="size"
      :variant="variant"
      :aria-label="ariaLabel"
      :title="title"
      :aria-expanded="popoverOpen"
      :aria-controls="menuId"
      aria-haspopup="menu"
      @click="togglePopover"
    >
      <slot />
    </BaseButton>
    <Teleport to="body">
      <div
        v-show="popoverOpen"
        :id="menuId"
        ref="menuPanelRef"
        data-testid="thread-agent-menu-panel"
        class="fixed z-[200] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
        :style="floatingMenuStyle"
        role="menu"
        aria-label="Choose agent for new thread"
      >
        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="opt in AGENT_OPTIONS"
            :key="opt.agent"
            type="button"
            role="menuitem"
            :title="opt.label"
            class="flex aspect-square w-full min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-border/70 bg-card/60 p-1.5 text-center shadow-sm transition-[border-color,box-shadow,background-color] duration-150 hover:border-border hover:bg-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
            @click="pickAgent(opt.agent)"
          >
            <AgentIcon :agent="opt.agent" :size="28" class="shrink-0" />
            <span class="w-full min-w-0 truncate text-[10px] leading-tight">{{ opt.label }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
