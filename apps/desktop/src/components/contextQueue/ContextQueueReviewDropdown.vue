<script setup lang="ts">
import { GripVertical, ListOrdered } from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";
import type { QueueItem } from "@/contextQueue/types";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const props = defineProps<{
  threadId: string | null;
  items: QueueItem[];
}>();

const emit = defineEmits<{
  confirm: [items: QueueItem[]];
}>();

const open = ref(false);
/** Root of panel content — scrolls inside here must not close the popover. */
const popoverPanelRef = ref<HTMLElement | null>(null);

function onGlobalScroll(ev: Event): void {
  if (!open.value) return;
  const t = ev.target;
  if (t instanceof Node && popoverPanelRef.value?.contains(t)) return;
  open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("scroll", onGlobalScroll, true);
  } else {
    document.removeEventListener("scroll", onGlobalScroll, true);
  }
});

onUnmounted(() => {
  document.removeEventListener("scroll", onGlobalScroll, true);
});

function cloneItems(items: QueueItem[]): QueueItem[] {
  return items.map((item) => ({
    ...item,
    meta: { ...item.meta }
  }));
}

const internalItems = ref<QueueItem[]>([]);
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

watch(
  () => open.value,
  (isOpen) => {
    if (isOpen) {
      internalItems.value = cloneItems(props.items);
    }
  }
);

watch(
  () => props.items,
  () => {
    if (open.value) {
      internalItems.value = cloneItems(props.items);
    }
  },
  { deep: true }
);

const confirmDisabled = computed(
  () =>
    internalItems.value.length === 0 ||
    internalItems.value.some((row) => row.pasteText.trim() === "")
);

const itemCount = computed(() => props.items.length);

function close(): void {
  open.value = false;
}

function confirm(): void {
  if (confirmDisabled.value) return;
  emit("confirm", cloneItems(internalItems.value));
  open.value = false;
}

function removeAt(index: number): void {
  internalItems.value = internalItems.value.filter((_, i) => i !== index);
}

function moveUp(index: number): void {
  if (index <= 0) return;
  const next = [...internalItems.value];
  const tmp = next[index - 1];
  next[index - 1] = next[index]!;
  next[index] = tmp!;
  internalItems.value = next;
}

function moveDown(index: number): void {
  if (index >= internalItems.value.length - 1) return;
  const next = [...internalItems.value];
  const tmp = next[index + 1];
  next[index + 1] = next[index]!;
  next[index] = tmp!;
  internalItems.value = next;
}

function onDragStart(index: number, e: DragEvent): void {
  dragFromIndex.value = index;
  e.dataTransfer?.setData("text/plain", String(index));
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
  }
}

function clearDragUi(): void {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
}

function onDragEnd(): void {
  clearDragUi();
}

function onDragOverRow(index: number, e: DragEvent): void {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
  dragOverIndex.value = index;
}

function onDragLeaveRow(index: number, e: DragEvent): void {
  const cur = e.currentTarget;
  const rel = e.relatedTarget;
  if (cur instanceof HTMLElement && rel instanceof Node && cur.contains(rel)) {
    return;
  }
  if (dragOverIndex.value === index) {
    dragOverIndex.value = null;
  }
}

function onDropRow(toIndex: number, e: DragEvent): void {
  e.preventDefault();
  const raw = e.dataTransfer?.getData("text/plain");
  const parsed = raw != null && raw !== "" ? Number.parseInt(raw, 10) : NaN;
  const from = Number.isFinite(parsed) ? parsed : dragFromIndex.value;
  if (from == null || typeof from !== "number" || Number.isNaN(from)) {
    clearDragUi();
    return;
  }
  if (from < 0 || from >= internalItems.value.length || toIndex < 0 || toIndex >= internalItems.value.length) {
    clearDragUi();
    return;
  }
  if (from === toIndex) {
    clearDragUi();
    return;
  }
  const next = [...internalItems.value];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved!);
  internalItems.value = next;
  clearDragUi();
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="xs"
        class="ms-1 shrink-0 gap-1 px-2"
        data-testid="workspace-context-queue-button"
        title="Review and send queued context to the agent terminal"
      >
        <ListOrdered class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="hidden sm:inline">Queue</span>
        <Badge
          v-if="itemCount > 0"
          variant="secondary"
          class="h-5 min-w-5 rounded-full px-1 text-[10px] tabular-nums"
          >{{ itemCount }}</Badge
        >
      </Button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      side="bottom"
      :side-offset="6"
      class="flex w-[min(36rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] max-h-[min(85vh,calc(100dvh-3rem))] flex-col gap-0 overflow-hidden p-0"
      @pointerdown.stop
    >
      <div ref="popoverPanelRef" class="flex min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden">
      <div class="shrink-0 border-b px-4 py-3">
        <h2 class="text-sm font-semibold text-foreground">Review context queue</h2>
        <p class="sr-only">Edit paste text for each queued item, reorder, or remove entries before confirming.</p>
        <p v-if="threadId" class="mt-0.5 text-xs text-muted-foreground">Thread {{ threadId }}</p>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p v-if="internalItems.length === 0" class="text-sm text-muted-foreground">No items in queue.</p>

        <div
          v-for="(row, index) in internalItems"
          :key="row.id"
          class="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 transition-shadow"
          :class="{
            'opacity-50 ring-2 ring-primary/40': dragFromIndex === index,
            'ring-2 ring-primary ring-offset-2 ring-offset-background': dragOverIndex === index && dragFromIndex !== index
          }"
          data-testid="context-queue-review-row"
          @dragenter.prevent="onDragOverRow(index, $event)"
          @dragover="onDragOverRow(index, $event)"
          @dragleave="onDragLeaveRow(index, $event)"
          @drop="onDropRow(index, $event)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="touch-none cursor-grab rounded border border-transparent p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
              draggable="true"
              title="Drag to reorder"
              :aria-label="`Drag item ${index + 1} to reorder`"
              data-testid="context-queue-review-drag-handle"
              @dragstart="onDragStart(index, $event)"
              @dragend="onDragEnd"
            >
              <GripVertical class="size-4 shrink-0" aria-hidden="true" />
            </button>
            <span class="text-xs font-medium text-muted-foreground">Item {{ index + 1 }}</span>
            <span class="text-xs text-muted-foreground">({{ row.source }})</span>
            <div class="ml-auto flex flex-wrap gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="index === 0"
                data-testid="context-queue-review-move-up"
                :aria-label="`Move item ${index + 1} up`"
                @click="moveUp(index)"
              >
                Up
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="index === internalItems.length - 1"
                data-testid="context-queue-review-move-down"
                :aria-label="`Move item ${index + 1} down`"
                @click="moveDown(index)"
              >
                Down
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="context-queue-review-delete"
                :aria-label="`Remove item ${index + 1}`"
                @click="removeAt(index)"
              >
                Delete
              </Button>
            </div>
          </div>
          <textarea
            v-model="row.pasteText"
            draggable="false"
            class="min-h-[5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="context-queue-review-paste"
            :aria-label="`Paste text for item ${index + 1}`"
          />
        </div>
      </div>

      <div class="flex shrink-0 justify-end gap-2 border-t px-4 py-3">
        <Button type="button" variant="outline" size="sm" data-testid="context-queue-review-cancel" @click="close">
          Close
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="context-queue-review-confirm"
          :disabled="confirmDisabled"
          @click="confirm"
        >
          Confirm
        </Button>
      </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
