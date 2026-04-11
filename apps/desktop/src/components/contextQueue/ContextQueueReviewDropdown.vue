<script setup lang="ts">
import {
  Bold,
  Code2,
  GripVertical,
  Heading2,
  Italic,
  Link2,
  ListOrdered,
  Paperclip,
  Quote,
  User,
  X
} from "lucide-vue-next";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { QueueItem } from "@/contextQueue/types";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { renderMarkdownToHtml } from "@/lib/markdown";

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

const editorTab = ref<"write" | "preview">("write");
const focusedItemId = ref<string | null>(null);
/** DOM refs keyed by queue row id (not reactive; only used for selection APIs). */
const textareaById: Record<string, HTMLTextAreaElement | undefined> = {};

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
      editorTab.value = "write";
      focusedItemId.value = internalItems.value[0]?.id ?? null;
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

watch(
  internalItems,
  (rows) => {
    if (!rows.some((r) => r.id === focusedItemId.value)) {
      focusedItemId.value = rows[0]?.id ?? null;
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

const headerSubtitle = computed(() => {
  const n = internalItems.value.length;
  const parts: string[] = [];
  if (props.threadId) {
    parts.push(`Thread ${props.threadId}`);
  }
  parts.push(n === 1 ? "1 queued item" : `${n} queued items`);
  return parts.join(" · ");
});

const previewMarkdown = computed(() =>
  internalItems.value
    .map((row, i) => `### Context ${i + 1} · ${row.source}\n\n${row.pasteText}`)
    .join("\n\n---\n\n")
);

const previewHtml = computed(() => renderMarkdownToHtml(previewMarkdown.value));

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

function registerTextarea(id: string, el: unknown): void {
  if (el instanceof HTMLTextAreaElement) {
    textareaById[id] = el;
  } else {
    delete textareaById[id];
  }
}

function focusedRow(): QueueItem | undefined {
  const id = focusedItemId.value;
  return id ? internalItems.value.find((r) => r.id === id) : undefined;
}

function focusedTextarea(): HTMLTextAreaElement | undefined {
  const id = focusedItemId.value;
  return id ? textareaById[id] : undefined;
}

function insertAroundSelection(before: string, after: string): void {
  const row = focusedRow();
  const ta = focusedTextarea();
  if (!row || !ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = row.pasteText;
  const sel = text.slice(start, end);
  row.pasteText = text.slice(0, start) + before + sel + after + text.slice(end);
  const newStart = start + before.length;
  const newEnd = newStart + sel.length;
  void nextTick(() => {
    ta.focus();
    ta.setSelectionRange(newStart, newEnd);
  });
}

function insertHeading(): void {
  const row = focusedRow();
  const ta = focusedTextarea();
  if (!row || !ta) return;
  const pos = ta.selectionStart;
  const text = row.pasteText;
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  row.pasteText = `${text.slice(0, lineStart)}## ${text.slice(lineStart)}`;
  void nextTick(() => {
    ta.focus();
    const at = lineStart + 3;
    ta.setSelectionRange(at, at);
  });
}

function insertQuote(): void {
  const row = focusedRow();
  const ta = focusedTextarea();
  if (!row || !ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = row.pasteText;
  const block = text.slice(start, end);
  const lines = block.split("\n");
  const quoted = lines.map((ln) => (ln.length ? `> ${ln}` : ">")).join("\n");
  row.pasteText = text.slice(0, start) + quoted + text.slice(end);
  void nextTick(() => {
    ta.focus();
    const at = start + quoted.length;
    ta.setSelectionRange(at, at);
  });
}

function insertLink(): void {
  const url = window.prompt("Link URL");
  if (!url) return;
  insertAroundSelection("[", `](${url})`);
}

/** Open the queue review panel (e.g. after enqueueing from the editor). */
function openReview(): void {
  open.value = true;
}

defineExpose({ openReview });
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="ms-1 shrink-0 gap-0.5 text-muted-foreground hover:text-foreground"
        data-testid="workspace-context-queue-button"
        title="Review and send queued context to the agent terminal"
      >
        <span class="sr-only">Queue</span>
        <ListOrdered class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <Badge
          v-if="itemCount > 0"
          variant="secondary"
          class="h-4 min-w-4 rounded-full px-0.5 text-[9px] tabular-nums leading-none"
          >{{ itemCount }}</Badge
        >
      </Button>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      side="bottom"
      :side-offset="6"
      class="flex w-[min(40rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] max-h-[min(85vh,calc(100dvh-3rem))] flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-lg"
      @pointerdown.stop
    >
      <div ref="popoverPanelRef" class="flex min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden">
        <!-- GitHub-style review header -->
        <div class="flex shrink-0 items-start gap-3 border-b border-border bg-muted/25 px-4 py-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
            aria-hidden="true"
          >
            <User class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1 pt-0.5">
            <h2 class="text-sm font-semibold leading-tight text-foreground">Agent context review</h2>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ headerSubtitle }}</p>
            <p class="sr-only">
              Edit paste text for each queued item, reorder, or remove entries before sending to the agent terminal.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Close"
            data-testid="context-queue-review-close-header"
            @click="close"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>

        <!-- Write / Preview + toolbar -->
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5">
          <div
            class="inline-flex rounded-md bg-muted/50 p-0.5"
            role="tablist"
            aria-label="Editor mode"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="editorTab === 'write'"
              class="rounded px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                editorTab === 'write'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              data-testid="context-queue-review-tab-write"
              @click="editorTab = 'write'"
            >
              Write
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="editorTab === 'preview'"
              class="rounded px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                editorTab === 'preview'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              data-testid="context-queue-review-tab-preview"
              @click="editorTab = 'preview'"
            >
              Preview
            </button>
          </div>
          <div
            v-show="editorTab === 'write'"
            class="flex flex-wrap items-center gap-0.5"
            aria-label="Formatting"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              title="Heading"
              aria-label="Insert heading"
              @click="insertHeading"
            >
              <Heading2 class="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              title="Bold"
              aria-label="Bold"
              @click="insertAroundSelection('**', '**')"
            >
              <Bold class="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              title="Italic"
              aria-label="Italic"
              @click="insertAroundSelection('*', '*')"
            >
              <Italic class="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              title="Quote"
              aria-label="Quote"
              @click="insertQuote"
            >
              <Quote class="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              title="Code"
              aria-label="Code"
              @click="insertAroundSelection('`', '`')"
            >
              <Code2 class="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground"
              title="Link"
              aria-label="Link"
              @click="insertLink"
            >
              <Link2 class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Body -->
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <template v-if="editorTab === 'write'">
            <p v-if="internalItems.length === 0" class="text-sm text-muted-foreground">No items in queue.</p>

            <div
              v-for="(row, index) in internalItems"
              :key="row.id"
              class="mb-3 flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 transition-shadow last:mb-0"
              :class="{
                'opacity-50 ring-2 ring-primary/40': dragFromIndex === index,
                'ring-2 ring-primary ring-offset-2 ring-offset-background':
                  dragOverIndex === index && dragFromIndex !== index
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
                :ref="(el) => registerTextarea(row.id, el)"
                v-model="row.pasteText"
                draggable="false"
                class="min-h-[6.5rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(212,92%,45%)] focus-visible:ring-offset-0 dark:focus-visible:ring-[hsl(212,92%,58%)]"
                data-testid="context-queue-review-paste"
                :aria-label="`Paste text for item ${index + 1}`"
                @focus="focusedItemId = row.id"
              />
            </div>
          </template>

          <div v-else class="context-queue-preview rounded-md border border-border bg-muted/15 px-3 py-3 text-sm">
            <p v-if="internalItems.length === 0" class="text-muted-foreground">Nothing to preview.</p>
            <div
              v-else
              class="context-queue-preview-md text-foreground"
              data-testid="context-queue-review-preview"
              v-html="previewHtml"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/15 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="gap-1.5 text-muted-foreground"
            disabled
            title="Attachments are not available for the context queue yet"
          >
            <Paperclip class="h-3.5 w-3.5" aria-hidden="true" />
            Add files
          </Button>
          <div class="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" data-testid="context-queue-review-cancel" @click="close">
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="context-queue-review-confirm"
              :disabled="confirmDisabled"
              @click="confirm"
            >
              Send to agent
            </Button>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.context-queue-preview-md :deep(p) {
  margin: 0.4em 0;
}
.context-queue-preview-md :deep(p:first-child) {
  margin-top: 0;
}
.context-queue-preview-md :deep(p:last-child) {
  margin-bottom: 0;
}
.context-queue-preview-md :deep(h1),
.context-queue-preview-md :deep(h2),
.context-queue-preview-md :deep(h3) {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0.75em 0 0.35em;
}
.context-queue-preview-md :deep(h3:first-child) {
  margin-top: 0;
}
.context-queue-preview-md :deep(pre) {
  margin: 0.5em 0;
  overflow-x: auto;
  border-radius: 0.375rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.75rem;
  background: hsl(var(--muted));
}
.context-queue-preview-md :deep(code) {
  font-size: 0.8em;
  border-radius: 0.25rem;
  padding: 0.1em 0.3em;
  background: hsl(var(--muted));
}
.context-queue-preview-md :deep(pre code) {
  padding: 0;
  background: transparent;
}
.context-queue-preview-md :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}
.context-queue-preview-md :deep(ul),
.context-queue-preview-md :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.25rem;
}
.context-queue-preview-md :deep(hr) {
  margin: 1rem 0;
  border: 0;
  border-top: 1px solid hsl(var(--border));
}
</style>
