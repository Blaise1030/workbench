<script setup lang="ts">
import { GripVertical, ListOrdered, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import type { QueueItem } from "@/contextQueue/types";
import { parseDiffQueuePaste } from "@/contextQueue/diffPasteParse";
import { queueContextBadgeLabel, queueSnippetPreview } from "@/contextQueue/reviewPasteLabels";
import { Badge } from "@/components/ui/badge/index";
import {Button} from "@/components/ui/button";;
import ContextQueueDiffPasteComposer from "@/components/contextQueue/ContextQueueDiffPasteComposer.vue";
import PromptWithFileAttachments from "@/components/PromptWithFileAttachments.vue";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/** Optional per-item note (@mentions, attachments) merged into paste on send — off until re-enabled. */
const QUEUE_REVIEW_MESSAGE_ENABLED = false;

const props = defineProps<{
  threadId: string | null;
  items: QueueItem[];
  worktreePath?: string | null;
}>();

const emit = defineEmits<{
  confirm: [items: QueueItem[]];
  /** Sync in-progress edits back to the thread queue when the panel closes without confirm. */
  persistDraft: [items: QueueItem[]];
}>();

const open = ref(false);
/** When true, the next `open` → false transition is from Confirm (do not re-persist draft to the queue). */
const closingAfterConfirm = ref(false);

/** Opens the review panel; while open, the toolbar button does not toggle closed (use Cancel). */
function onQueueToolbarClick(): void {
  if (!open.value) open.value = true;
}

function cloneItems(items: QueueItem[]): QueueItem[] {
  return items.map((item) => ({
    ...item,
    meta: { ...item.meta },
    reviewComment: item.reviewComment ?? "",
    reviewAttachments: item.reviewAttachments?.map((a) => ({ ...a })) ?? []
  }));
}

/** Keep review drafts when props refresh (e.g. new queue item); parent items omit in-progress review fields. */
function mergeItemsFromProps(prev: QueueItem[], incoming: QueueItem[]): QueueItem[] {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  return cloneItems(incoming).map((row) => {
    const old = prevById.get(row.id);
    if (!old) return row;
    const incomingNote = row.reviewComment ?? "";
    const oldNote = old.reviewComment ?? "";
    const keepComment = incomingNote.trim().length > 0 ? incomingNote : oldNote;
    const incomingAtt = row.reviewAttachments ?? [];
    const oldAtt = old.reviewAttachments ?? [];
    const keepAtt =
      incomingAtt.length > 0 ? incomingAtt.map((a) => ({ ...a })) : oldAtt.map((a) => ({ ...a }));
    return {
      ...row,
      reviewComment: keepComment,
      reviewAttachments: keepAtt
    };
  });
}

const internalItems = ref<QueueItem[]>([]);
const tiptapResetKey = ref(0);
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
/** At most one row shows the paste editor; newest items take focus when added. */
const editingRowId = ref<string | null>(null);

watch(
  () => open.value,
  (isOpen) => {
    if (isOpen) {
      internalItems.value = cloneItems(props.items);
      const rows = internalItems.value;
      editingRowId.value = rows.length > 0 ? rows[rows.length - 1]!.id : null;
      tiptapResetKey.value++;
      return;
    }
    if (!closingAfterConfirm.value) {
      emit("persistDraft", cloneItems(internalItems.value));
    }
    closingAfterConfirm.value = false;
  }
);

watch(
  () => props.items,
  () => {
    if (!open.value) return;
    const prevIds = new Set(internalItems.value.map((r) => r.id));
    internalItems.value = mergeItemsFromProps(internalItems.value, props.items);
    const newlyAdded = internalItems.value.filter((r) => !prevIds.has(r.id));
    if (newlyAdded.length > 0) {
      editingRowId.value = newlyAdded[newlyAdded.length - 1]!.id;
    } else {
      ensureEditingRowValid();
    }
  },
  { deep: true }
);

function ensureEditingRowValid(): void {
  const ids = new Set(internalItems.value.map((r) => r.id));
  if (editingRowId.value != null && !ids.has(editingRowId.value)) {
    editingRowId.value =
      internalItems.value.length > 0 ? internalItems.value[internalItems.value.length - 1]!.id : null;
  }
}

function isRowEditing(id: string): boolean {
  return editingRowId.value === id;
}

function pasteBlobPreview(row: QueueItem): string {
  return queueSnippetPreview(row, 480);
}

function setEditingRow(rowId: string): void {
  editingRowId.value = rowId;
}

function useDiffPasteComposer(row: QueueItem): boolean {
  return row.source === "diff" && parseDiffQueuePaste(row.pasteText) != null;
}

function buildItemForSend(row: QueueItem): QueueItem {
  const parts: string[] = [row.pasteText];
  if (QUEUE_REVIEW_MESSAGE_ENABLED) {
    const note = row.reviewComment?.trim();
    if (note) parts.push(note);
    const att = row.reviewAttachments;
    if (att?.length) {
      parts.push(`[Attached files]\n${att.map((a) => a.path).join("\n")}`);
    }
  }
  return {
    id: row.id,
    source: row.source,
    meta: { ...row.meta },
    pasteText: parts.join("\n\n")
  };
}

function onQueueRowDoubleClick(rowId: string, e: MouseEvent): void {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest("button")) return;
  if (t.closest('[data-testid="context-queue-review-drag-handle"]')) return;
  if (t.closest('[data-testid="context-queue-review-paste-blob"]')) return;
  if (t.closest('[data-testid="context-queue-review-chip"]')) return;
  if (t.closest("textarea")) return;
  if (t.closest("[data-context-queue-review-note]")) return;
  if (t.closest("[data-diff-composer]")) return;
  setEditingRow(rowId);
}

const confirmDisabled = computed(
  () =>
    internalItems.value.length === 0 ||
    internalItems.value.some((row) => row.pasteText.trim() === "")
);

const itemCount = computed(() => props.items.length);

const sendToAgentLabel = computed(() => {
  const n = internalItems.value.length;
  if (n === 1) return "Send 1 task to agent";
  return `Send ${n} tasks to agent`;
});

function close(): void {
  open.value = false;
}

function confirm(): void {
  if (confirmDisabled.value) return;
  closingAfterConfirm.value = true;
  emit("confirm", internalItems.value.map((row) => buildItemForSend(row)));
  open.value = false;
}

function removeAt(index: number): void {
  const id = internalItems.value[index]?.id;
  internalItems.value = internalItems.value.filter((_, i) => i !== index);
  if (editingRowId.value === id) {
    editingRowId.value =
      internalItems.value.length > 0 ? internalItems.value[internalItems.value.length - 1]!.id : null;
  } else {
    ensureEditingRowValid();
  }
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

/** Open the queue review panel (e.g. after enqueueing from the editor). */
function openReview(): void {
  open.value = true;
}

defineExpose({ openReview });
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor as-child>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="ms-1 shrink-0 gap-1.5 text-foreground shadow-sm ring-1 ring-border/80 hover:bg-muted/80"
        data-testid="workspace-context-queue-button"
        title="Review and send queued context to the agent terminal"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="onQueueToolbarClick"
      >
        <ListOrdered class="size-3.5 shrink-0 text-foreground" aria-hidden="true" />
        <span class="text-[0.8rem] font-medium">Queue</span>
        <Badge
          v-if="itemCount > 0"
          variant="default"
          class="ms-0.5 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold tabular-nums leading-none"
          ><span aria-hidden="true">📋</span>{{ itemCount }}</Badge
        >
      </Button>
    </PopoverAnchor>

    <PopoverContent
      align="end"
      side="bottom"
      :side-offset="6"
      class="flex w-[min(26rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] max-h-[min(85vh,calc(100dvh-3rem))] flex-col gap-0 overflow-hidden border-0 bg-popover p-0 text-popover-foreground shadow-lg ring-1 ring-border/50"
      @pointerdown.stop
      @escape-key-down.prevent
      @pointer-down-outside.prevent
      @focus-outside.prevent
    >
      <div class="flex min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden">
        <div
          class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <h2 class="text-xs font-semibold leading-tight text-foreground">Review task</h2>
            <p class="sr-only">
              Edit paste text for each queued item, reorder, or remove entries before sending to the agent terminal.
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 px-2.5 text-xs"
              data-testid="context-queue-review-cancel"
              @click="close"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              class="h-8 px-2.5 text-xs"
              data-testid="context-queue-review-confirm"
              :disabled="confirmDisabled"
              @click="confirm"
            >
              {{ sendToAgentLabel }}
            </Button>
          </div>
        </div>

        <!-- Body -->
        <div class="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
            <p v-if="internalItems.length === 0" class="text-xs text-muted-foreground">No items in queue.</p>

            <div
              v-for="(row, index) in internalItems"
              :key="row.id"
              class="mb-2 flex flex-col gap-1.5 rounded-md bg-muted/15 px-2 py-1.5 transition-shadow last:mb-0"
              :class="{
                'opacity-50 ring-2 ring-primary/40': dragFromIndex === index,
                'ring-2 ring-primary ring-offset-1 ring-offset-background':
                  dragOverIndex === index && dragFromIndex !== index
              }"
              data-testid="context-queue-review-row"
              title="Click the preview to edit that item, or double-click empty space on the row"
              @dragenter.prevent="onDragOverRow(index, $event)"
              @dragover="onDragOverRow(index, $event)"
              @dragleave="onDragLeaveRow(index, $event)"
              @drop="onDropRow(index, $event)"
              @dblclick="onQueueRowDoubleClick(row.id, $event)"
            >
              <div class="flex min-w-0 items-start gap-1.5">
                <button
                  type="button"
                  class="mt-0.5 shrink-0 touch-none cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground active:cursor-grabbing"
                  draggable="true"
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                  data-testid="context-queue-review-drag-handle"
                  @dblclick.stop
                  @dragstart="onDragStart(index, $event)"
                  @dragend="onDragEnd"
                >
                  <GripVertical class="size-3.5 shrink-0" aria-hidden="true" />
                </button>
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <template v-if="!isRowEditing(row.id)">
                    <div class="flex min-w-0 items-start gap-1">
                      <button
                        v-if="!row.pasteText.trim()"
                        type="button"
                        data-testid="context-queue-review-chip"
                        class="min-h-[2.5rem] flex-1 rounded-md bg-muted/50 px-2 py-1.5 text-center text-xs text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                        aria-label="Empty context; click to edit"
                        @click="setEditingRow(row.id)"
                      >
                        <span class="truncate text-muted-foreground">Empty context</span>
                      </button>
                      <button
                        v-else
                        type="button"
                        data-testid="context-queue-review-paste-blob"
                        class="max-h-32 min-h-[2.5rem] flex-1 overflow-y-auto rounded-md border border-border/60 bg-muted/25 px-2 py-1.5 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                        :aria-label="`Preview queued ${row.source} context; click to edit`"
                        @click="setEditingRow(row.id)"
                      >
                        <span class="whitespace-pre-wrap break-words font-mono">{{ pasteBlobPreview(row) }}</span>
                      </button>
                      <button
                        type="button"
                        class="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                        data-testid="context-queue-review-remove-row"
                        :aria-label="`Remove ${row.source} entry`"
                        @click.stop="removeAt(index)"
                      >
                        <X class="size-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <div v-if="QUEUE_REVIEW_MESSAGE_ENABLED" data-context-queue-review-note>
                      <PromptWithFileAttachments
                        :key="`${tiptapResetKey}-${row.id}`"
                        v-model:prompt="row.reviewComment"
                        v-model:attachments="row.reviewAttachments"
                        :tiptap="true"
                        :worktree-path="worktreePath"
                        :context-tag-label="queueContextBadgeLabel(row)"
                        show-queue-remove
                        :queue-remove-aria-label="`Remove ${row.source} entry`"
                        placeholder="Optional note — @ files, / commands, paperclip for attachments"
                        test-id-prefix="context-queue-review-note"
                        @queue-remove="removeAt(index)"
                      />
                    </div>

                    <ContextQueueDiffPasteComposer
                      v-if="useDiffPasteComposer(row)"
                      v-model="row.pasteText"
                    />
                    <textarea
                      v-else
                      v-model="row.pasteText"
                      draggable="false"
                      class="min-h-[5rem] w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(212,92%,45%)] focus-visible:ring-offset-0 dark:focus-visible:ring-[hsl(212,92%,58%)]"
                      data-testid="context-queue-review-paste"
                      :aria-label="`Paste text from ${row.source}`"
                      @dblclick.stop
                    />
                  </template>
                </div>
              </div>
            </div>
          </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
