<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { QueueCapture } from "@/contextQueue/types";
import { basenamePath, joinDiffQueuePaste, parseDiffQueuePaste } from "@/contextQueue/diffPasteParse";

const modelValue = defineModel<string>({ required: true });

type DiffCap = Extract<QueueCapture, { source: "diff" }>;

const beforeRef = ref<HTMLElement | null>(null);
const afterRef = ref<HTMLElement | null>(null);

const initialParsed = parseDiffQueuePaste(modelValue.value);
const capture = ref<DiffCap | null>(initialParsed?.capture ?? null);
const internalSync = ref(false);

const fileBase = computed(() => (capture.value ? basenamePath(capture.value.filePath) : ""));
const lineLabel = computed(() => {
  const c = capture.value;
  if (c == null || c.lineStart == null || c.lineEnd == null) return "";
  return `L${c.lineStart}-${c.lineEnd}`;
});

function readPrefix(): string {
  return beforeRef.value?.textContent ?? "";
}

function readSuffix(): string {
  return afterRef.value?.textContent ?? "";
}

function applyExternalValue(text: string): void {
  const p = parseDiffQueuePaste(text);
  if (!p) return;
  capture.value = p.capture;
  void nextTick(() => {
    if (beforeRef.value) beforeRef.value.textContent = p.prefix;
    if (afterRef.value) afterRef.value.textContent = p.suffix;
  });
}

function pushModel(): void {
  const cap = capture.value;
  if (!cap) return;
  internalSync.value = true;
  modelValue.value = joinDiffQueuePaste(readPrefix(), cap, readSuffix());
  void nextTick(() => {
    internalSync.value = false;
  });
}

watch(
  () => modelValue.value,
  (nv) => {
    if (internalSync.value) return;
    applyExternalValue(nv);
  }
);

onMounted(() => {
  const p = parseDiffQueuePaste(modelValue.value);
  if (!p) return;
  if (beforeRef.value) beforeRef.value.textContent = p.prefix;
  if (afterRef.value) afterRef.value.textContent = p.suffix;
});
</script>

<template>
  <div
    v-if="capture"
    data-diff-composer
    data-testid="context-queue-review-diff-composer"
    class="flex min-h-[6.5rem] w-full flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-within:border-transparent focus-within:outline-none focus-within:ring-2 focus-within:ring-[hsl(212,92%,45%)] focus-within:ring-offset-0 dark:focus-within:ring-[hsl(212,92%,58%)]"
    role="textbox"
    :aria-label="'Edit message around diff reference'"
    @dblclick.stop
  >
    <span
      ref="beforeRef"
      contenteditable="true"
      data-testid="context-queue-diff-paste-before"
      class="min-h-[1.35em] min-w-[0.5ch] whitespace-pre-wrap break-words outline-none"
      @input="pushModel"
    />
    <span
      contenteditable="false"
      data-testid="context-queue-diff-badge"
      class="inline-flex max-w-full shrink-0 select-none items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 align-baseline text-xs shadow-sm"
    >
      <span class="shrink-0 text-[13px] leading-none" aria-hidden="true">❗</span>
      <span class="truncate font-medium text-teal-800 dark:text-teal-200">{{ fileBase }}</span>
      <span v-if="lineLabel" class="shrink-0 tabular-nums text-muted-foreground">{{ lineLabel }}</span>
    </span>
    <span
      ref="afterRef"
      contenteditable="true"
      data-testid="context-queue-diff-paste-after"
      class="min-h-[1.35em] min-w-[2ch] flex-1 whitespace-pre-wrap break-words outline-none"
      @input="pushModel"
    />
  </div>
</template>
