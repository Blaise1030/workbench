<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import Button from "@/components/ui/Button.vue";
import type { KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import { pathsFromUnifiedDiff } from "@shared/diffPaths";

const keybindings = useKeybindingsStore();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

const props = withDefaults(
  defineProps<{
    selectedDiff: string;
    /** Optional context in the sticky bar (one path or "N files"). */
    summaryLabel: string | null;
    /**
     * When set (e.g. from `git status`), used for the file checklist instead of re-scanning
     * `selectedDiff` — avoids O(size of diff) work when the unified diff is huge.
     */
    changedFilePaths?: string[] | null;
    queuedReviewCount?: number;
  }>(),
  {
    changedFilePaths: null,
    queuedReviewCount: 0,
  }
);

/** Cap text in `<pre>` so Vue/DOM do not choke on multi‑MB strings. */
const RAW_PRE_MAX_CHARS = 450_000;

const emit = defineEmits<{
  stageAll: [];
  discardAll: [];
  stageSelected: [paths: string[]];
  discardSelected: [paths: string[]];
  openInAgents: [];
  clearReviewItems: [];
}>();

const diffHostRef = ref<HTMLElement | null>(null);
const rawCollapsed = ref(false);
const changedFilesExpanded = ref(true);
const masterCheckboxRef = ref<HTMLInputElement | null>(null);

const diffFilePaths = computed(() => {
  const fromStatus = props.changedFilePaths;
  if (fromStatus != null && fromStatus.length > 0) return fromStatus;
  return pathsFromUnifiedDiff(props.selectedDiff);
});

const displayedDiffForPre = computed(() => {
  const raw = props.selectedDiff;
  if (raw.length <= RAW_PRE_MAX_CHARS) return raw;
  const cut = raw.lastIndexOf("\n", RAW_PRE_MAX_CHARS);
  const safe = cut > RAW_PRE_MAX_CHARS * 0.85 ? cut : RAW_PRE_MAX_CHARS;
  return `${raw.slice(0, safe)}\n\n… (${raw.length.toLocaleString()} characters total; preview truncated)`;
});
const checkedByPath = ref<Record<string, boolean>>({});

watch(
  diffFilePaths,
  (paths) => {
    const next: Record<string, boolean> = {};
    for (const p of paths) {
      next[p] = checkedByPath.value[p] ?? true;
    }
    checkedByPath.value = next;
  },
  { immediate: true }
);

const checkedPaths = computed(() => diffFilePaths.value.filter((p) => checkedByPath.value[p]));
const hasSelectableFiles = computed(() => diffFilePaths.value.length > 0);
const allFilesChecked = computed(
  () => hasSelectableFiles.value && checkedPaths.value.length === diffFilePaths.value.length
);

watchEffect(() => {
  const el = masterCheckboxRef.value;
  if (!el) return;
  const n = checkedPaths.value.length;
  const total = diffFilePaths.value.length;
  el.indeterminate = n > 0 && n < total;
});

function togglePath(path: string, checked: boolean): void {
  checkedByPath.value = { ...checkedByPath.value, [path]: checked };
}

function toggleSelectAll(checked: boolean): void {
  const next = { ...checkedByPath.value };
  for (const p of diffFilePaths.value) {
    next[p] = checked;
  }
  checkedByPath.value = next;
}

function emitStageSelected(): void {
  emit("stageSelected", [...checkedPaths.value]);
}

function emitDiscardSelected(): void {
  emit("discardSelected", [...checkedPaths.value]);
}

defineExpose({
  getCheckedPathsForStaging: (): string[] => [...checkedPaths.value]
});

function emitOpenInAgents(): void {
  emit("openInAgents");
}

type DiffEmptyVisual = { emoji: string; caption: string; showRaw?: boolean };

const diffEmptyVisual = computed((): DiffEmptyVisual | null => {
  const t = props.selectedDiff.trim();
  if (t === "No unstaged changes.") {
    return { emoji: "✨", caption: "Working tree is clean — nothing to diff." };
  }
  if (t === "Diff preview will render here.") {
    return { emoji: "🌿", caption: "Your diff will show up here." };
  }
  if (t.startsWith("Could not load diff")) {
    return { emoji: "😵", caption: "Could not load the diff.", showRaw: true };
  }
  return null;
});

const reviewBasketSummary = computed(() => {
  if (props.queuedReviewCount <= 0) return null;
  const itemLabel = props.queuedReviewCount === 1 ? "review item" : "review items";
  return `${props.queuedReviewCount} ${itemLabel} queued`;
});

const summaryLabelText = computed(() => props.summaryLabel);
const queuedReviewCountValue = computed(() => props.queuedReviewCount);

watch(
  () => props.selectedDiff,
  () => {
    rawCollapsed.value = false;
    changedFilesExpanded.value = true;
  }
);
</script>

<template>
  <section class="flex h-full border-t min-h-0 flex-col bg-background text-xs">
    <!-- Single scrollport: toolbar + diff share one overflow (toolbar is sticky). -->
    <div
      ref="diffHostRef"
      class="diff-scroll-root flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"
    >
      <!-- Toolbar + changed-files strip share one sticky stack so both stay visible while scrolling the diff. -->
      <div
        class="sticky top-0 z-10 shrink-0 border-b border-border bg-background"
      >
        <header class="flex shrink-0 flex-wrap items-center gap-2 bg-background p-3">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span
              v-if="summaryLabelText"
              class="min-w-0 max-w-[min(100%,28rem)] truncate text-xs text-muted-foreground"
              :title="summaryLabelText ?? undefined"
              >{{ summaryLabelText }}</span
            >
            <span
              v-if="reviewBasketSummary"
              class="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {{ reviewBasketSummary }}
            </span>
          </div>
          <div class="ml-auto flex flex-wrap gap-2">
            <Button
              v-if="queuedReviewCountValue > 0"
              size="sm"
              variant="secondary"
              class="border-0 shadow-none focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
              aria-label="Open in Agents"
              @click="emitOpenInAgents"
            >
              Open in Agents
            </Button>
            <Button
              v-if="queuedReviewCountValue > 0"
              size="sm"
              variant="secondary"
              class="border-0 shadow-none focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
              aria-label="Clear review items"
              @click="emit('clearReviewItems')"
            >
              Clear review items
            </Button>
            <Button
              size="sm"
              variant="secondary"
              class="border-0 shadow-none focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
              :title="titleWithShortcut('Stage all', 'stageAllDiff')"
              @click="emit('stageAll')"
              >Stage All</Button
            >
            <Button
              size="sm"
              variant="destructive"
              class="border-0 shadow-none focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
              title="Discard all changes in this worktree (no keyboard shortcut)"
              @click="emit('discardAll')"
              >Discard All</Button
            >
          </div>
        </header>
        <div
          v-if="hasSelectableFiles"
          data-testid="diff-file-selection"
        >
          <div
            class="flex py-2 flex-wrap items-center gap-x-2 gap-y-2 border-b border-border py-0 pl-5 pr-3"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="inline-flex py-2 min-w-0 flex-1 items-center gap-2 rounded-[min(var(--radius-md),12px)] pl-2 pr-2.5 text-left text-[0.8rem] font-medium leading-none text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              :aria-expanded="changedFilesExpanded"
              aria-controls="diff-changed-files-list"
              @click="changedFilesExpanded = !changedFilesExpanded"
            >
              <span
                class="pointer-events-none inline-block size-0 shrink-0 border-[5px] border-transparent border-t-muted-foreground/70 transition-transform duration-150 ease-out"
                :class="changedFilesExpanded ? '' : '-rotate-90'"
                aria-hidden="true"
              />
              <span>Changed files</span>
            </Button>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                class="border-0 shadow-none focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
                :disabled="checkedPaths.length === 0"
                @click="emitStageSelected"
                >Stage selected</Button
              >
              <Button
                size="sm"
                variant="destructive"
                class="border-0 shadow-none focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
                :disabled="checkedPaths.length === 0"
                title="Discard changes to selected files (no keyboard shortcut)"
                @click="emitDiscardSelected"
                >Discard selected</Button
              >
              <label class="flex h-7 cursor-pointer items-center gap-1.5 pr-0.5">
                <input
                  ref="masterCheckboxRef"
                  type="checkbox"
                  class="size-3.5 rounded border border-border accent-primary"
                  :checked="allFilesChecked"
                  aria-label="Select all changed files"
                  @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
                />
                <span class="sr-only">Select all</span>
              </label>
            </div>
          </div>
          <ul
            v-show="changedFilesExpanded"
            id="diff-changed-files-list"
            class="m-0 max-h-32 list-none space-y-1 overflow-y-auto py-2 pl-5 pr-3 pt-1"
          >
            <li v-for="(p, i) in diffFilePaths" :key="p" class="flex min-w-0 items-center gap-2">
              <input
                :id="`diff-cb-${i}`"
                type="checkbox"
                class="size-3.5 shrink-0 rounded border border-border accent-primary"
                :checked="Boolean(checkedByPath[p])"
                :aria-label="`Select ${p} for stage or discard`"
                @change="togglePath(p, ($event.target as HTMLInputElement).checked)"
              />
              <label
                :for="`diff-cb-${i}`"
                class="min-w-0 flex-1 cursor-pointer truncate font-mono text-xs text-foreground"
                :title="p"
                >{{ p }}</label
              >
            </li>
          </ul>
        </div>
      </div>
      <template v-if="diffEmptyVisual">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center"
            role="status"
          >
            <span class="text-4xl leading-none" aria-hidden="true">{{ diffEmptyVisual.emoji }}</span>
            <p class="max-w-xs text-sm text-muted-foreground">{{ diffEmptyVisual.caption }}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="mt-1"
              aria-label="Open in Agents"
              @click="emitOpenInAgents"
            >
              Open in Agents
            </Button>
          </div>
          <div v-if="diffEmptyVisual.showRaw" class="shrink-0 border-t border-border p-2">
            <pre
              class="m-0 overflow-auto rounded-md border border-border bg-background p-3 text-left text-xs whitespace-pre-wrap font-mono"
              >{{ displayedDiffForPre }}</pre
            >
          </div>
        </div>
      </template>
      <template v-else>
        <div class="p-2">
          <div class="overflow-hidden rounded-md border border-border bg-background shadow-sm">
            <Button
              v-if="summaryLabelText"
              type="button"
              variant="ghost"
              size="sm"
              class="flex w-full items-center gap-2 border-0 border-b border-border bg-muted/40 px-3 py-2 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-0"
              :aria-expanded="!rawCollapsed"
              @click="rawCollapsed = !rawCollapsed"
            >
              <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ summaryLabelText }}</span>
              <span
                class="pointer-events-none inline-block size-0 shrink-0 border-[5px] border-transparent border-t-muted-foreground/70 transition-transform duration-150 ease-out"
                :class="rawCollapsed ? '-rotate-90' : ''"
                aria-hidden="true"
              />
            </Button>
            <pre
              v-show="!rawCollapsed || !summaryLabelText"
              class="m-0 bg-background p-3 whitespace-pre-wrap font-mono"
              >{{ displayedDiffForPre }}</pre
            >
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
