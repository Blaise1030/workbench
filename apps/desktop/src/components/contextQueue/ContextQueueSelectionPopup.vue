<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import { clampPopupRect, type Rect } from "@/lib/contextQueueAnchor";
import { eventMatchesBinding, findDefinitionIn, type KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

/** Selection popup “Queue” target (review basket); off until re-enabled. */
const CONTEXT_QUEUE_SELECTION_QUEUE_ENABLED = false;

const props = defineProps<{
  visible: boolean;
  anchor: Rect | null;
}>();

const emit = defineEmits<{
  queue: [];
  /** Send this capture straight to the agent PTY (skip the review queue). */
  sendToAgent: [];
  dismiss: [];
}>();

const keybindings = useKeybindingsStore();
const queueButtonTitle = computed(() =>
  keybindings.titleWithShortcut("Queue", "contextQueueSelectionQueue")
);
const agentButtonTitle = computed(() =>
  keybindings.titleWithShortcut("Agent", "contextQueueSelectionSendToAgent")
);

/** Primary chord only (before " · ") for compact inline hints. */
function primaryShortcutLabel(id: KeybindingId): string {
  const full = keybindings.shortcutLabelForId(id);
  const sep = full.indexOf(" · ");
  return sep >= 0 ? full.slice(0, sep).trim() : full;
}

const agentShortcutInline = computed(() => primaryShortcutLabel("contextQueueSelectionSendToAgent"));
const queueShortcutInline = computed(() => primaryShortcutLabel("contextQueueSelectionQueue"));

const popupEl = ref<HTMLElement | null>(null);
const position = ref({ left: 0, top: 0 });

const fallbackSize = { w: 220, h: 36 };

const keydownCaptureOpts = { capture: true } as const;

function updatePosition(): void {
  if (!props.visible || !props.anchor) return;
  const el = popupEl.value;
  const w = el?.offsetWidth || fallbackSize.w;
  const h = el?.offsetHeight || fallbackSize.h;
  position.value = clampPopupRect(props.anchor, w, h);
}

/** Two rAF passes so layout uses measured popup size after `v-if` mounts. */
function scheduleReposition(): void {
  requestAnimationFrame(() => {
    updatePosition();
    requestAnimationFrame(() => updatePosition());
  });
}

const showPopup = computed(() => props.visible && props.anchor != null);

let popupResizeObserver: ResizeObserver | null = null;

function unbindGlobalLayout(): void {
  window.removeEventListener("resize", scheduleReposition);
  window.visualViewport?.removeEventListener("resize", scheduleReposition);
  window.visualViewport?.removeEventListener("scroll", scheduleReposition);
}

function bindGlobalLayout(): void {
  unbindGlobalLayout();
  window.addEventListener("resize", scheduleReposition);
  window.visualViewport?.addEventListener("resize", scheduleReposition);
  window.visualViewport?.addEventListener("scroll", scheduleReposition);
}

watch(
  () => [props.visible, props.anchor] as const,
  async () => {
    await nextTick();
    if (showPopup.value && popupEl.value) {
      popupResizeObserver?.disconnect();
      popupResizeObserver = new ResizeObserver(() => scheduleReposition());
      popupResizeObserver.observe(popupEl.value);
    } else if (!showPopup.value) {
      popupResizeObserver?.disconnect();
      popupResizeObserver = null;
    }
    scheduleReposition();
  },
  { immediate: true, deep: true }
);

function onPopupKeydown(e: KeyboardEvent): void {
  if (!showPopup.value) return;
  if (e.key === "Escape") {
    emit("dismiss");
    return;
  }
  const defs = keybindings.effectiveDefinitions;
  const agentDef = findDefinitionIn(defs, "contextQueueSelectionSendToAgent");
  const queueDef = findDefinitionIn(defs, "contextQueueSelectionQueue");
  if (agentDef && eventMatchesBinding(e, agentDef)) {
    e.preventDefault();
    e.stopPropagation();
    emit("sendToAgent");
    return;
  }
  if (
    CONTEXT_QUEUE_SELECTION_QUEUE_ENABLED &&
    queueDef &&
    eventMatchesBinding(e, queueDef)
  ) {
    e.preventDefault();
    e.stopPropagation();
    emit("queue");
    return;
  }
}

function onGlobalScroll(): void {
  if (showPopup.value) emit("dismiss");
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener("keydown", onPopupKeydown, keydownCaptureOpts);
      document.addEventListener("scroll", onGlobalScroll, true);
      bindGlobalLayout();
    } else {
      window.removeEventListener("keydown", onPopupKeydown, keydownCaptureOpts);
      document.removeEventListener("scroll", onGlobalScroll, true);
      unbindGlobalLayout();
      popupResizeObserver?.disconnect();
      popupResizeObserver = null;
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  window.removeEventListener("keydown", onPopupKeydown, keydownCaptureOpts);
  document.removeEventListener("scroll", onGlobalScroll, true);
  unbindGlobalLayout();
  popupResizeObserver?.disconnect();
  popupResizeObserver = null;
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showPopup"
      ref="popupEl"
      data-testid="context-queue-selection-popup"
      class="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-md"
      :style="{
        position: 'fixed',
        left: `${position.left}px`,
        top: `${position.top}px`,
        right: 'auto',
        bottom: 'auto',
        zIndex: 9999
      }"
      @pointerdown.stop
    >
      <Button
        variant="ghost"
        size="xs"
        class="gap-1 text-muted-foreground hover:text-foreground"
        data-testid="context-queue-selection-agent"
        :title="agentButtonTitle"
        @click="emit('sendToAgent')"
      >
        <span>Agent</span>
        <span
          v-if="agentShortcutInline"
          class="font-medium text-[10px] leading-none text-muted-foreground/90 tabular-nums"
          >{{ agentShortcutInline }}</span
        >
      </Button>
      <Button
        v-if="CONTEXT_QUEUE_SELECTION_QUEUE_ENABLED"
        variant="ghost"
        size="xs"
        class="gap-1 text-muted-foreground hover:text-foreground"
        data-testid="context-queue-selection-queue"
        :title="queueButtonTitle"
        @click="emit('queue')"
      >
        <span>Queue</span>
        <span
          v-if="queueShortcutInline"
          class="font-medium text-[10px] leading-none text-muted-foreground/90 tabular-nums"
          >{{ queueShortcutInline }}</span
        >
      </Button>
    </div>
  </Teleport>
</template>
