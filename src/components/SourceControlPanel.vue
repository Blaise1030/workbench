<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { html as diffToHtml } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import BaseButton from "@/components/ui/BaseButton.vue";
import type { RepoStatusEntry } from "@shared/ipc";
import { looksLikeUnifiedDiff } from "@shared/diffPaths";
import "diff2html/bundles/css/diff2html.min.css";

type SectionId = "staged" | "unstaged" | "untracked";
type EntryScope = "staged" | "unstaged";
type FlatItem =
  | { kind: "section"; id: SectionId; label: string; count: number }
  | { kind: "entry"; id: string; path: string; scope: EntryScope; badge: string; muted?: string };

const props = defineProps<{
  repoStatus: RepoStatusEntry[];
  selectedPath: string | null;
  selectedScope: EntryScope | null;
  selectedDiff: string;
  diffLoading: boolean;
}>();

const emit = defineEmits<{
  selectEntry: [payload: { path: string; scope: EntryScope }];
  stageAll: [];
  unstageAll: [];
  discardAll: [];
  stagePaths: [paths: string[]];
  unstagePaths: [paths: string[]];
  discardPaths: [paths: string[]];
}>();

const richDiffMaxBytes = 300_000;
const rawPreMaxChars = 240_000;
const sidebarScrollRef = ref<HTMLElement | null>(null);
const sidebarViewportHeight = ref(320);
const sidebarScrollTop = ref(0);
const diffHostRef = ref<HTMLElement | null>(null);
const diffColorScheme = ref<ColorSchemeType>(ColorSchemeType.LIGHT);
let diffThemeObserver: MutationObserver | null = null;
let sidebarResizeObserver: ResizeObserver | null = null;

function sectionEntries(section: SectionId): FlatItem[] {
  if (section === "staged") {
    return props.repoStatus
      .filter((entry) => entry.stagedKind && !entry.isUntracked)
      .map((entry) => ({
        kind: "entry" as const,
        id: `staged:${entry.path}`,
        path: entry.path,
        scope: "staged" as const,
        badge: entry.stagedKind === "renamed" ? "R" : entry.stagedKind?.slice(0, 1).toUpperCase() ?? "M",
        muted: entry.originalPath ?? undefined
      }));
  }
  if (section === "unstaged") {
    return props.repoStatus
      .filter((entry) => entry.unstagedKind && !entry.isUntracked)
      .map((entry) => ({
        kind: "entry" as const,
        id: `unstaged:${entry.path}`,
        path: entry.path,
        scope: "unstaged" as const,
        badge:
          entry.unstagedKind === "renamed" ? "R" : entry.unstagedKind?.slice(0, 1).toUpperCase() ?? "M",
        muted: entry.originalPath ?? undefined
      }));
  }
  return props.repoStatus
    .filter((entry) => entry.isUntracked)
    .map((entry) => ({
      kind: "entry" as const,
      id: `untracked:${entry.path}`,
      path: entry.path,
      scope: "unstaged" as const,
      badge: "U"
    }));
}

const stagedEntries = computed(() => sectionEntries("staged"));
const unstagedEntries = computed(() => sectionEntries("unstaged"));
const untrackedEntries = computed(() => sectionEntries("untracked"));

const flatItems = computed<FlatItem[]>(() => {
  const out: FlatItem[] = [];
  const sections: [SectionId, string, FlatItem[]][] = [
    ["staged", "Staged", stagedEntries.value],
    ["unstaged", "Unstaged", unstagedEntries.value],
    ["untracked", "Untracked", untrackedEntries.value]
  ];
  for (const [id, label, entries] of sections) {
    if (entries.length === 0) continue;
    out.push({ kind: "section", id, label, count: entries.length });
    out.push(...entries);
  }
  return out;
});

const totalChanges = computed(
  () => stagedEntries.value.length + unstagedEntries.value.length + untrackedEntries.value.length
);

const selectedEntry = computed(() => {
  if (!props.selectedPath || !props.selectedScope) return null;
  return flatItems.value.find(
    (item) =>
      item.kind === "entry" && item.path === props.selectedPath && item.scope === props.selectedScope
  );
});

const sidebarMetrics = computed(() => {
  let offset = 0;
  return flatItems.value.map((item) => {
    const height = item.kind === "section" ? 34 : 32;
    const metric = { item, top: offset, height };
    offset += height;
    return metric;
  });
});

const sidebarContentHeight = computed(() => {
  const last = sidebarMetrics.value[sidebarMetrics.value.length - 1];
  return last ? last.top + last.height : 0;
});

const visibleSidebarItems = computed(() => {
  const scrollTop = sidebarScrollTop.value;
  const viewBottom = scrollTop + sidebarViewportHeight.value;
  return sidebarMetrics.value.filter((metric) => {
    const itemBottom = metric.top + metric.height;
    return itemBottom >= scrollTop - 240 && metric.top <= viewBottom + 240;
  });
});

const rawDiffPreview = computed(() => {
  const raw = props.selectedDiff;
  if (raw.length <= rawPreMaxChars) return raw;
  return `${raw.slice(0, rawPreMaxChars)}\n\n… (${raw.length.toLocaleString()} characters total; preview truncated)`;
});

function diffColorSchemeFromDocument(): ColorSchemeType {
  if (typeof document === "undefined") return ColorSchemeType.LIGHT;
  return document.documentElement.classList.contains("dark") ? ColorSchemeType.DARK : ColorSchemeType.LIGHT;
}

const richDiffHtml = computed(() => {
  const raw = props.selectedDiff;
  if (!looksLikeUnifiedDiff(raw) || raw.length > richDiffMaxBytes) return null;
  try {
    return diffToHtml(raw, {
      drawFileList: false,
      colorScheme: diffColorScheme.value,
      outputFormat: "line-by-line",
      diffStyle: "word"
    });
  } catch {
    return null;
  }
});

const emptyMessage = computed(() => {
  if (totalChanges.value === 0) return "Working tree is clean.";
  if (!selectedEntry.value) return "Select a changed file to inspect it.";
  if (!props.selectedDiff.trim() && !props.diffLoading) return "No diff to show for this selection.";
  return null;
});

function onSidebarScroll(): void {
  sidebarScrollTop.value = sidebarScrollRef.value?.scrollTop ?? 0;
}

function selectEntry(path: string, scope: EntryScope): void {
  emit("selectEntry", { path, scope });
}

function actionStageSelected(): void {
  if (!selectedEntry.value || selectedEntry.value.scope !== "unstaged") return;
  emit("stagePaths", [selectedEntry.value.path]);
}

function actionUnstageSelected(): void {
  if (!selectedEntry.value || selectedEntry.value.scope !== "staged") return;
  emit("unstagePaths", [selectedEntry.value.path]);
}

function actionDiscardSelected(): void {
  if (!selectedEntry.value || selectedEntry.value.scope !== "unstaged") return;
  emit("discardPaths", [selectedEntry.value.path]);
}

watch(
  () => flatItems.value,
  async (items) => {
    if (items.length === 0) return;
    if (selectedEntry.value) return;
    const firstEntry = items.find((item) => item.kind === "entry");
    if (!firstEntry || firstEntry.kind !== "entry") return;
    await nextTick();
    selectEntry(firstEntry.path, firstEntry.scope);
  },
  { immediate: true }
);

onMounted(() => {
  diffColorScheme.value = diffColorSchemeFromDocument();
  diffThemeObserver = new MutationObserver(() => {
    diffColorScheme.value = diffColorSchemeFromDocument();
  });
  diffThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  if (sidebarScrollRef.value) {
    sidebarViewportHeight.value = sidebarScrollRef.value.clientHeight;
    if (typeof ResizeObserver !== "undefined") {
      sidebarResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        sidebarViewportHeight.value = entry.contentRect.height;
      });
      sidebarResizeObserver.observe(sidebarScrollRef.value);
    }
  }
});

onBeforeUnmount(() => {
  diffThemeObserver?.disconnect();
  diffThemeObserver = null;
  sidebarResizeObserver?.disconnect();
  sidebarResizeObserver = null;
});
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-xs text-foreground">
    <aside class="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-muted/20">
      <header class="border-b border-border px-3 py-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Source Control
            </p>
            <p class="mt-1 text-sm font-medium text-foreground">
              {{ totalChanges.toLocaleString() }} changes
            </p>
          </div>
          <div class="flex items-center gap-1">
            <BaseButton size="sm" variant="secondary" @click="emit('stageAll')">Stage All</BaseButton>
            <BaseButton size="sm" variant="secondary" @click="emit('unstageAll')">Unstage All</BaseButton>
          </div>
        </div>
      </header>
      <div
        ref="sidebarScrollRef"
        class="min-h-0 flex-1 overflow-y-auto"
        @scroll="onSidebarScroll"
      >
        <div :style="{ height: `${sidebarContentHeight}px`, position: 'relative' }">
          <template v-for="metric in visibleSidebarItems" :key="metric.item.kind === 'section' ? metric.item.id : metric.item.id">
            <div
              v-if="metric.item.kind === 'section'"
              class="absolute inset-x-0 flex items-center justify-between border-y border-border bg-background/95 px-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase backdrop-blur"
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
            >
              <span>{{ metric.item.label }}</span>
              <span>{{ metric.item.count }}</span>
            </div>
            <button
              v-else
              type="button"
              class="absolute inset-x-0 flex items-center gap-2 border-b border-border/40 px-3 text-left transition-colors hover:bg-muted/70"
              :class="
                selectedPath === metric.item.path && selectedScope === metric.item.scope
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground'
              "
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
              @click="selectEntry(metric.item.path, metric.item.scope)"
            >
              <span
                class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border bg-background font-mono text-[10px] font-semibold"
              >
                {{ metric.item.badge }}
              </span>
              <span class="min-w-0 flex-1 truncate font-mono">{{ metric.item.path }}</span>
            </button>
          </template>
        </div>
      </div>
      <footer class="border-t border-border px-3 py-2">
        <div class="flex flex-wrap gap-2">
          <BaseButton
            size="sm"
            variant="secondary"
            :disabled="!selectedEntry || selectedEntry.scope !== 'unstaged'"
            @click="actionStageSelected"
          >
            Stage
          </BaseButton>
          <BaseButton
            size="sm"
            variant="secondary"
            :disabled="!selectedEntry || selectedEntry.scope !== 'staged'"
            @click="actionUnstageSelected"
          >
            Unstage
          </BaseButton>
          <BaseButton
            size="sm"
            variant="destructive"
            :disabled="!selectedEntry || selectedEntry.scope !== 'unstaged'"
            @click="actionDiscardSelected"
          >
            Discard
          </BaseButton>
          <BaseButton size="sm" variant="destructive" class="ml-auto" @click="emit('discardAll')">
            Discard All
          </BaseButton>
        </div>
      </footer>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex min-h-12 items-center gap-3 border-b border-border px-4">
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-sm text-foreground">
            {{ selectedEntry?.path ?? "No file selected" }}
          </p>
          <p class="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {{ selectedEntry?.scope === "staged" ? "Staged changes" : selectedEntry?.scope === "unstaged" ? "Working tree changes" : "Diff" }}
          </p>
        </div>
      </header>

      <div ref="diffHostRef" class="min-h-0 flex-1 overflow-auto">
        <div v-if="diffLoading" class="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading diff…
        </div>
        <div
          v-else-if="emptyMessage"
          class="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
        >
          {{ emptyMessage }}
        </div>
        <div
          v-else-if="richDiffHtml"
          class="diff-rich-host p-2"
          v-html="richDiffHtml"
        />
        <pre
          v-else
          class="m-0 min-h-full overflow-auto p-4 font-mono text-xs whitespace-pre-wrap"
        >{{ rawDiffPreview }}</pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
@reference "../styles/globals.css";

.diff-rich-host :deep(.d2h-file-wrapper) {
  margin-bottom: 0 !important;
  border-color: var(--border) !important;
  background: var(--background);
  border-radius: 0.375rem !important;
  overflow: hidden !important;
}

.diff-rich-host :deep(.d2h-file-header) {
  background-color: var(--background) !important;
  border-color: var(--border) !important;
}

.diff-rich-host :deep(.d2h-file-name) {
  color: var(--foreground) !important;
}

.diff-rich-host :deep(.d2h-del) {
  background-color: color-mix(in srgb, var(--destructive) 14%, transparent) !important;
}

.diff-rich-host :deep(.d2h-ins) {
  background-color: color-mix(in srgb, var(--chart-2) 14%, transparent) !important;
}
</style>
