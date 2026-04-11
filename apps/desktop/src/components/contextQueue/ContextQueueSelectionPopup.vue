<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import { clampPopupRect, type Rect } from "@/lib/contextQueueAnchor";

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

const popupEl = ref<HTMLElement | null>(null);
const position = ref({ left: 0, top: 0 });

const fallbackSize = { w: 200, h: 40 };

function updatePosition(): void {
  if (!props.visible || !props.anchor) return;
  const el = popupEl.value;
  const w = el?.offsetWidth || fallbackSize.w;
  const h = el?.offsetHeight || fallbackSize.h;
  position.value = clampPopupRect(props.anchor, w, h);
}

const showPopup = computed(() => props.visible && props.anchor != null);

watch(
  () => [props.visible, props.anchor] as const,
  async () => {
    await nextTick();
    updatePosition();
  },
  { immediate: true, deep: true }
);

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") emit("dismiss");
}

function onGlobalScroll(): void {
  if (showPopup.value) emit("dismiss");
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener("keydown", onKeydown);
      document.addEventListener("scroll", onGlobalScroll, true);
    } else {
      window.removeEventListener("keydown", onKeydown);
      document.removeEventListener("scroll", onGlobalScroll, true);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("scroll", onGlobalScroll, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="showPopup"
      ref="popupEl"
      data-testid="context-queue-selection-popup"
      class="pointer-events-auto fixed z-[9999] flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-md"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @pointerdown.stop
    >
      <Button variant="outline" size="xs" data-testid="context-queue-selection-queue" @click="emit('queue')">
        Queue
      </Button>
      <Button size="xs" data-testid="context-queue-selection-agent" @click="emit('sendToAgent')">
        Agent
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        aria-label="Dismiss"
        data-testid="context-queue-selection-dismiss"
        @click="emit('dismiss')"
      >
        ×
      </Button>
    </div>
  </Teleport>
</template>
