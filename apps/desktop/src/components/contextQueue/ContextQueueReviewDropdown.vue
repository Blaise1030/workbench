<script setup lang="ts">
import { GripVertical, ListOrdered } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import type { QueueItem } from "@/contextQueue/types";
import { parseDiffQueuePaste } from "@/contextQueue/diffPasteParse";
import { queueContextBadgeLabel } from "@/contextQueue/reviewPasteLabels";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import ContextQueueDiffPasteComposer from "@/components/contextQueue/ContextQueueDiffPasteComposer.vue";
import PromptWithFileAttachments from "@/components/PromptWithFileAttachments.vue";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const props = defineProps<{
  threadId: string | null;
  items: QueueItem[];
  worktreePath?: string | null;
}>();

const emit = defineEmits<{
  confirm: [items: QueueItem[]];
}>();

const open = ref(false);

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

const internalItems = ref<QueueItem[]>([]);
const tiptapResetKey = ref(0);
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
/** Row ids whose paste editor is visible (shown after double-click on the row). */
const editorExpandedIds = ref<Set<string>>(new Set());

watch(
  () => open.value,
  (isOpen) => {
    if (isOpen) {
      internalItems.value = cloneItems(props.items);
      editorExpandedIds.value = new Set();
      tiptapResetKey.value++;
    }
  }
);

watch(
  () => props.items,
  () => {
    if (open.value) {
      internalItems.value = cloneItems(props.items);
      pruneExpandedEditors();
    }
  },
  { deep: true }
);

function pruneExpandedEditors(): void {
  const allowed = new Set(internalItems.value.map((r) => r.id));
  const next = new Set<string>();
  for (const id of editorExpandedIds.value) {
    if (allowed.has(id)) next.add(id);
  }
  editorExpandedIds.value = next;
}

function isRowEditorExpanded(id: string): boolean {
  return editorExpandedIds.value.has(id);
}

function useDiffPasteComposer(row: QueueItem): boolean {
  return row.source === "diff" && parseDiffQueuePaste(row.pasteText) != null;
}

function buildItemForSend(row: QueueItem): QueueItem {
  const parts: string[] = [row.pasteText];
  const note = row.reviewComment?.trim();
  if (note) parts.push(note);
  const att = row.reviewAttachments;
  if (att?.length) {
    parts.push(`[Attached files]\n${att.map((a) => a.path).join("\n")}`);
  }
  return {
    id: row.id,
    source: row.source,
    meta: { ...row.meta },
    pasteText: parts.join("\n\n")
  };
}

function expandRowEditor(rowId: string): void {
  const next = new Set(editorExpandedIds.value);
  next.add(rowId);
  editorExpandedIds.value = next;
}

function onQueueRowDoubleClick(rowId: string, e: MouseEvent): void {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest("button")) return;
  if (t.closest('[data-testid="context-queue-review-drag-handle"]')) return;
  if (t.closest("textarea")) return;
  if (t.closest("[data-context-queue-review-note]")) return;
  if (t.closest("[data-diff-composer]")) return;
  const next = new Set(editorExpandedIds.value);
  if (next.has(rowId)) next.delete(rowId);
  else next.add(rowId);
  editorExpandedIds.value = next;
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
  emit("confirm", internalItems.value.map((row) => buildItemForSend(row)));
  open.value = false;
}

function removeAt(index: number): void {
  const id = internalItems.value[index]?.id;
  internalItems.value = internalItems.value.filter((_, i) => i !== index);
  if (id) {
    const next = new Set(editorExpandedIds.value);
    next.delete(id);
    editorExpandedIds.value = next;
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
              title="Double-click row to show or hide context editor"
              @dragenter.prevent="onDragOverRow(index, $event)"
              @dragover="onDragOverRow(index, $event)"
              @dragleave="onDragLeaveRow(index, $event)"
              @drop="onDropRow(index, $event)"
              @dblclick="onQueueRowDoubleClick(row.id, $event)"
            >
              <div class="flex min-h-7 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="touch-none cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground active:cursor-grabbing"
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
              </div>

              <button
                v-if="!isRowEditorExpanded(row.id) && !row.pasteText.trim()"
                type="button"
                data-testid="context-queue-review-chip"
                class="flex w-full min-w-0 max-w-full items-center justify-center rounded-md bg-muted/50 px-2 py-1 text-center text-xs text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                aria-label="Empty context; click to edit"
                @click="expandRowEditor(row.id)"
              >
                <span class="truncate text-muted-foreground">Empty context</span>
              </button>
              <div data-context-queue-review-note>
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
                v-if="isRowEditorExpanded(row.id) && useDiffPasteComposer(row)"
                v-model="row.pasteText"
              />
              <textarea
                v-else-if="isRowEditorExpanded(row.id)"
                v-model="row.pasteText"
                draggable="false"
                class="min-h-[5rem] w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(212,92%,45%)] focus-visible:ring-offset-0 dark:focus-visible:ring-[hsl(212,92%,58%)]"
                data-testid="context-queue-review-paste"
                :aria-label="`Paste text from ${row.source}`"
                @dblclick.stop
              />
            </div>
          </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
