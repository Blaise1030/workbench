<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { QueueItem } from "@/contextQueue/types";
import Button from "@/components/ui/Button.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

const props = defineProps<{
  open: boolean;
  threadId: string | null;
  items: QueueItem[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [items: QueueItem[]];
}>();

function cloneItems(items: QueueItem[]): QueueItem[] {
  return items.map((item) => ({
    ...item,
    meta: { ...item.meta }
  }));
}

const internalItems = ref<QueueItem[]>([]);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      internalItems.value = cloneItems(props.items);
    }
  },
  { immediate: true }
);

const confirmDisabled = computed(
  () =>
    internalItems.value.length === 0 ||
    internalItems.value.some((row) => row.pasteText.trim() === "")
);

function onDialogOpenChange(next: boolean): void {
  emit("update:open", next);
}

function cancel(): void {
  emit("update:open", false);
}

function confirm(): void {
  if (confirmDisabled.value) return;
  emit("confirm", cloneItems(internalItems.value));
  emit("update:open", false);
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
</script>

<template>
  <Dialog :open="open" @update:open="onDialogOpenChange">
    <DialogContent
      aria-labelledby="context-queue-review-title"
      class="flex max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0"
    >
      <DialogHeader class="shrink-0 border-b px-6 py-4">
        <DialogTitle id="context-queue-review-title">Review context queue</DialogTitle>
        <DialogDescription class="sr-only">
          Edit paste text for each queued item, reorder, or remove entries before confirming.
        </DialogDescription>
        <p v-if="threadId" class="mt-1 text-xs text-muted-foreground">Thread {{ threadId }}</p>
      </DialogHeader>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
        <p v-if="internalItems.length === 0" class="text-sm text-muted-foreground">No items in queue.</p>

        <div
          v-for="(row, index) in internalItems"
          :key="row.id"
          class="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
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
            class="min-h-[5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="context-queue-review-paste"
            :aria-label="`Paste text for item ${index + 1}`"
          />
        </div>
      </div>

      <DialogFooter class="shrink-0 border-t px-6 py-4">
        <Button type="button" variant="outline" data-testid="context-queue-review-cancel" @click="cancel">
          Cancel
        </Button>
        <Button
          type="button"
          data-testid="context-queue-review-confirm"
          :disabled="confirmDisabled"
          @click="confirm"
        >
          Confirm
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
