<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { html as diffToHtml } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import { ChevronDown } from "lucide-vue-next";
import { Loader2, Maximize2, Minimize2, RefreshCw, Undo2 } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";
import type { RepoStatusEntry } from "@shared/ipc";
import { looksLikeUnifiedDiff } from "@shared/diffPaths";
import "diff2html/bundles/css/diff2html.min.css";

const commitMessage = defineModel<string>("commitMessage", { default: "" });

type SectionId = "staged" | "unstaged" | "untracked";
type EntryScope = "staged" | "unstaged";
type FlatItem =
  | { kind: "section"; id: SectionId; label: string; count: number; majorDividerAbove?: boolean }
  | {
      kind: "entry";
      id: string;
      path: string;
      scope: EntryScope;
      badge: string;
      muted?: string;
      sectionId: SectionId;
    };

const props = withDefaults(
  defineProps<{
    repoStatus: RepoStatusEntry[];
    /** One-line repo context, e.g. `folder / main` from `RepoScmSnapshot`. */
    branchLine?: string | null;
    /** Latest commit subject from `git log -1`; shown as a one-click draft hint. */
    lastCommitSubject?: string | null;
    /** Desktop preload exposes `gitFetch`. */
    scmFetchAvailable?: boolean;
    scmCommitAvailable?: boolean;
    scmFetchBusy?: boolean;
    scmCommitBusy?: boolean;
    selectedPath: string | null;
    selectedScope: EntryScope | null;
    selectedDiff: string;
    diffLoading: boolean;
  }>(),
  {
    branchLine: null,
    lastCommitSubject: null,
    scmFetchAvailable: false,
    scmCommitAvailable: false,
    scmFetchBusy: false,
    scmCommitBusy: false
  }
);

const emit = defineEmits<{
  selectEntry: [payload: { path: string; scope: EntryScope }];
  stageAll: [];
  unstageAll: [];
  discardAll: [];
  stagePaths: [paths: string[]];
  unstagePaths: [paths: string[]];
  discardPaths: [paths: string[]];
  fetch: [];
  commit: [];
}>();

const richDiffMaxBytes = 300_000;
const rawPreMaxChars = 240_000;
/** Fixed row heights for virtualized sidebar (must match template layout). */
const SECTION_ROW_PX = 22;
const ENTRY_ROW_PX = 22;
/** Extra top padding + border lane after staged block, before working tree. */
const SECTION_MAJOR_GAP_PX = 10;
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
        sectionId: "staged" as const,
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
        sectionId: "unstaged" as const,
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
      sectionId: "untracked" as const,
      badge: "U"
    }));
}

const stagedEntries = computed(() => sectionEntries("staged"));
const unstagedEntries = computed(() => sectionEntries("unstaged"));
const untrackedEntries = computed(() => sectionEntries("untracked"));

const hasStagedChanges = computed(() =>
  props.repoStatus.some((e) => Boolean(e.stagedKind) && !e.isUntracked)
);

const canCommit = computed(
  () =>
    props.scmCommitAvailable &&
    !props.scmCommitBusy &&
    hasStagedChanges.value &&
    Boolean(commitMessage.value.trim())
);

const commitExpanded = ref(false);
const actionsOpen = ref(false);

function applyLastCommitSubject(): void {
  const s = props.lastCommitSubject;
  if (s) commitMessage.value = s;
}

const flatItems = computed<FlatItem[]>(() => {
  const out: FlatItem[] = [];
  const sections: [SectionId, string, FlatItem[]][] = [
    ["staged", "Staged", stagedEntries.value],
    ["unstaged", "Unstaged", unstagedEntries.value],
    ["untracked", "Untracked", untrackedEntries.value]
  ];
  let placedStagedBlock = false;
  let needMajorDividerBeforeNextSection = false;
  for (const [id, label, entries] of sections) {
    if (entries.length === 0) continue;
    if (id === "staged") {
      out.push({ kind: "section", id, label, count: entries.length });
      out.push(...entries);
      placedStagedBlock = true;
      needMajorDividerBeforeNextSection = true;
      continue;
    }
    const majorDividerAbove = needMajorDividerBeforeNextSection && placedStagedBlock;
    needMajorDividerBeforeNextSection = false;
    out.push({ kind: "section", id, label, count: entries.length, majorDividerAbove });
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

/** Entry row ids (`staged:path`, `untracked:path`, …) selected for bulk actions. */
const checkedEntryIds = ref<string[]>([]);

function isEntryChecked(id: string): boolean {
  return checkedEntryIds.value.includes(id);
}

function toggleEntryChecked(id: string): void {
  const cur = checkedEntryIds.value;
  checkedEntryIds.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

const checkedStagedPaths = computed(() => {
  const ids = new Set(checkedEntryIds.value);
  const paths: string[] = [];
  for (const item of flatItems.value) {
    if (item.kind !== "entry" || !ids.has(item.id) || item.sectionId !== "staged") continue;
    paths.push(item.path);
  }
  return paths;
});

const checkedWorktreePaths = computed(() => {
  const ids = new Set(checkedEntryIds.value);
  const paths: string[] = [];
  for (const item of flatItems.value) {
    if (item.kind !== "entry" || !ids.has(item.id)) continue;
    if (item.sectionId === "unstaged" || item.sectionId === "untracked") paths.push(item.path);
  }
  return paths;
});

const canStageFromSelection = computed(
  () =>
    checkedWorktreePaths.value.length > 0 ||
    (selectedEntry.value != null && selectedEntry.value.scope === "unstaged")
);

const canUnstageFromSelection = computed(
  () =>
    checkedStagedPaths.value.length > 0 ||
    (selectedEntry.value != null && selectedEntry.value.scope === "staged")
);

const canDiscardFromSelection = computed(
  () =>
    checkedWorktreePaths.value.length > 0 ||
    (selectedEntry.value != null && selectedEntry.value.scope === "unstaged")
);

watch(
  () => flatItems.value,
  (items) => {
    const valid = new Set(
      items.filter((i): i is Extract<FlatItem, { kind: "entry" }> => i.kind === "entry").map((i) => i.id)
    );
    const next = checkedEntryIds.value.filter((id) => valid.has(id));
    if (next.length !== checkedEntryIds.value.length) checkedEntryIds.value = next;
  },
  { flush: "post" }
);

function entryIdsForSection(sectionId: SectionId): string[] {
  if (sectionId === "staged") return stagedEntries.value.map((e) => e.id);
  if (sectionId === "unstaged") return unstagedEntries.value.map((e) => e.id);
  return untrackedEntries.value.map((e) => e.id);
}

function sectionSelectAllState(sectionId: SectionId): { checked: boolean; indeterminate: boolean } {
  const ids = entryIdsForSection(sectionId);
  if (ids.length === 0) return { checked: false, indeterminate: false };
  const selected = new Set(checkedEntryIds.value);
  const n = ids.filter((id) => selected.has(id)).length;
  if (n === 0) return { checked: false, indeterminate: false };
  if (n === ids.length) return { checked: true, indeterminate: false };
  return { checked: false, indeterminate: true };
}

function toggleSectionSelectAll(sectionId: SectionId): void {
  const ids = entryIdsForSection(sectionId);
  if (ids.length === 0) return;
  const { checked } = sectionSelectAllState(sectionId);
  const next = new Set(checkedEntryIds.value);
  if (checked) {
    for (const id of ids) next.delete(id);
  } else {
    for (const id of ids) next.add(id);
  }
  checkedEntryIds.value = [...next];
}

/** Section-header “select all” inputs (virtualized); sync `indeterminate` after selection changes. */
const sectionSelectAllInputs = new Map<SectionId, HTMLInputElement>();

/**
 * Stable ref callbacks per section — inline `(el) => bind(...)` creates a new function every render and
 * makes Vue unbind/rebind refs each patch, which can throw `Cannot set properties of null (setting '__vnode')`.
 */
const sectionSelectAllInputBinders = new Map<SectionId, (el: unknown) => void>();

function getSectionSelectAllInputRef(sectionId: SectionId): (el: unknown) => void {
  let binder = sectionSelectAllInputBinders.get(sectionId);
  if (!binder) {
    binder = (el: unknown) => bindSectionSelectAllInput(sectionId, el);
    sectionSelectAllInputBinders.set(sectionId, binder);
  }
  return binder;
}

function bindSectionSelectAllInput(sectionId: SectionId, el: unknown): void {
  const input = el instanceof HTMLInputElement ? el : null;
  if (input) {
    sectionSelectAllInputs.set(sectionId, input);
    void nextTick(() => {
      const cur = sectionSelectAllInputs.get(sectionId);
      if (!cur?.isConnected) return;
      const st = sectionSelectAllState(sectionId);
      cur.checked = st.checked;
      cur.indeterminate = st.indeterminate;
    });
  } else {
    sectionSelectAllInputs.delete(sectionId);
  }
}

function syncAllSectionSelectAllInputs(): void {
  for (const [sectionId, el] of [...sectionSelectAllInputs.entries()]) {
    if (!el.isConnected) {
      sectionSelectAllInputs.delete(sectionId);
      continue;
    }
    const st = sectionSelectAllState(sectionId);
    el.checked = st.checked;
    el.indeterminate = st.indeterminate;
  }
}

watch(
  () => [checkedEntryIds.value.join("\0"), stagedEntries.value.length, unstagedEntries.value.length, untrackedEntries.value.length] as const,
  () => {
    void nextTick(() => syncAllSectionSelectAllInputs());
  }
);

const sidebarMetrics = computed(() => {
  let offset = 0;
  return flatItems.value.map((item) => {
    const height =
      item.kind === "section"
        ? SECTION_ROW_PX + (item.majorDividerAbove ? SECTION_MAJOR_GAP_PX : 0)
        : ENTRY_ROW_PX;
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

function sectionHeaderClasses(item: Extract<FlatItem, { kind: "section" }>): string {
  const base =
    "absolute inset-x-0 flex flex-col border-b bg-background/95 backdrop-blur";
  const staged =
    "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-50/95";
  const unstaged =
    "border-sky-500/20 bg-sky-500/[0.07] text-sky-950/90 dark:border-sky-500/15 dark:bg-sky-500/10 dark:text-sky-50/90";
  const untracked =
    "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/12 dark:text-emerald-50/90";
  if (item.id === "staged") return `${base} ${staged}`;
  if (item.id === "unstaged") return `${base} ${unstaged}`;
  return `${base} ${untracked}`;
}

function entryRowClasses(sectionId: SectionId): string {
  if (sectionId === "staged") {
    return "border-b border-amber-500/15 bg-amber-500/[0.05] hover:bg-amber-500/12 dark:border-amber-500/10";
  }
  if (sectionId === "unstaged") {
    return "border-b border-sky-500/10 bg-sky-500/[0.04] hover:bg-sky-500/10 dark:border-sky-500/10 dark:bg-sky-500/[0.06]";
  }
  return "border-b border-emerald-500/15 bg-emerald-500/[0.05] hover:bg-emerald-500/12 dark:border-emerald-500/10";
}

function selectEntry(path: string, scope: EntryScope): void {
  emit("selectEntry", { path, scope });
}

function actionStageSelected(): void {
  const bulk = checkedWorktreePaths.value;
  if (bulk.length > 0) {
    emit("stagePaths", bulk);
    return;
  }
  if (!selectedEntry.value || selectedEntry.value.scope !== "unstaged") return;
  emit("stagePaths", [selectedEntry.value.path]);
}

function actionUnstageSelected(): void {
  const bulk = checkedStagedPaths.value;
  if (bulk.length > 0) {
    emit("unstagePaths", bulk);
    return;
  }
  if (!selectedEntry.value || selectedEntry.value.scope !== "staged") return;
  emit("unstagePaths", [selectedEntry.value.path]);
}

function actionDiscardSelected(): void {
  const bulk = checkedWorktreePaths.value;
  if (bulk.length > 0) {
    emit("discardPaths", bulk);
    return;
  }
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
  <section class="flex h-full min-h-0 bg-background text-[11px] text-foreground">
    <aside class="flex min-h-0 w-[272px] shrink-0 flex-col border-r border-border bg-muted/20">
      <header class="border-b border-border px-2 py-2">
        <div class="flex items-start justify-between gap-1.5">
          <div class="min-w-0">
            <p class="text-[9px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Source Control
            </p>
            <p class="mt-0.5 text-[11px] font-medium leading-tight text-foreground">
              {{ totalChanges.toLocaleString() }} changes
            </p>
          </div>
          <!-- Actions dropdown -->
          <div class="relative shrink-0">
            <BaseButton
              size="xs"
              variant="secondary"
              class="h-6 gap-1 px-2 text-[10px]"
              @click="actionsOpen = !actionsOpen"
            >
              Actions
              <ChevronDown class="h-3 w-3" :class="actionsOpen ? 'rotate-180' : ''" aria-hidden="true" />
            </BaseButton>
            <div v-if="actionsOpen" class="fixed inset-0 z-40" @click="actionsOpen = false" />
            <div
              v-if="actionsOpen"
              class="absolute right-0 top-full z-50 mt-1 min-w-[130px] rounded-md border border-border bg-popover py-1 shadow-md"
            >
              <!-- Selection actions -->
              <button
                class="flex w-full items-center px-3 py-1.5 text-[10px] text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!canStageFromSelection"
                @click="actionStageSelected(); actionsOpen = false"
              >
                Stage Selected
              </button>
              <button
                class="flex w-full items-center px-3 py-1.5 text-[10px] text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!canUnstageFromSelection"
                @click="actionUnstageSelected(); actionsOpen = false"
              >
                Unstage Selected
              </button>
              <button
                class="flex w-full items-center px-3 py-1.5 text-[10px] text-destructive hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!canDiscardFromSelection"
                @click="actionDiscardSelected(); actionsOpen = false"
              >
                Discard Selected
              </button>
              <!-- Divider -->
              <div class="my-1 border-t border-border" />
              <!-- Bulk actions -->
              <button
                class="flex w-full items-center px-3 py-1.5 text-[10px] text-foreground hover:bg-muted"
                @click="emit('stageAll'); actionsOpen = false"
              >
                Stage All
              </button>
              <button
                class="flex w-full items-center px-3 py-1.5 text-[10px] text-foreground hover:bg-muted"
                @click="emit('unstageAll'); actionsOpen = false"
              >
                Unstage All
              </button>
              <button
                class="flex w-full items-center px-3 py-1.5 text-[10px] text-destructive hover:bg-muted"
                @click="emit('discardAll'); actionsOpen = false"
              >
                Discard All
              </button>
            </div>
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
              :class="sectionHeaderClasses(metric.item)"
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
            >
              <div
                v-if="metric.item.majorDividerAbove"
                class="shrink-0 border-t-2 border-amber-500/50 dark:border-amber-400/40"
              />
              <div
                v-if="metric.item.majorDividerAbove"
                class="shrink-0 bg-gradient-to-b from-muted/60 to-transparent dark:from-muted/40"
                :style="{ height: `${SECTION_MAJOR_GAP_PX - 2}px` }"
              />
              <div
                class="flex min-h-[22px] flex-1 items-center justify-between gap-1 px-2 text-[9px] font-semibold tracking-[0.12em] uppercase"
              >
                <span class="min-w-0 shrink">{{ metric.item.label }}</span>
                <div class="flex shrink-0 items-center gap-1.5">
                  <span class="tabular-nums opacity-90">{{ metric.item.count }}</span>
                  <label
                    v-if="metric.item.id === 'staged' || metric.item.id === 'unstaged'"
                    class="flex cursor-pointer items-center border-l border-border/40 pl-1.5"
                    @click.stop
                  >
                    <input
                      :ref="getSectionSelectAllInputRef(metric.item.id)"
                      type="checkbox"
                      class="size-3.5 rounded border-border accent-primary"
                      :aria-label="
                        metric.item.id === 'staged'
                          ? 'Select all staged files'
                          : 'Select all unstaged files'
                      "
                      @change="toggleSectionSelectAll(metric.item.id)"
                      @click.stop
                    />
                  </label>
                </div>
              </div>
            </div>
            <div
              v-else
              class="absolute inset-x-0 flex items-stretch"
              :class="[
                selectedPath === metric.item.path && selectedScope === metric.item.scope
                  ? 'z-[1] border-b border-primary/25 bg-primary/18 text-foreground ring-1 ring-inset ring-primary/30 dark:bg-primary/22'
                  : entryRowClasses(metric.item.sectionId)
              ]"
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1 px-2 py-0 text-left transition-colors"
                :class="
                  selectedPath === metric.item.path && selectedScope === metric.item.scope
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                "
                @click="selectEntry(metric.item.path, metric.item.scope)"
              >
                <span
                  class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-background font-mono text-[8px] font-semibold leading-none"
                >
                  {{ metric.item.badge }}
                </span>
                <span class="min-w-0 flex-1 truncate font-mono text-[10px] leading-tight">{{ metric.item.path }}</span>
              </button>
              <label
                class="flex shrink-0 cursor-pointer items-center border-l border-border/40 bg-background/30 px-1.5 dark:bg-background/15"
                @click.stop
              >
                <input
                  type="checkbox"
                  class="size-3.5 rounded border-border accent-primary"
                  :checked="isEntryChecked(metric.item.id)"
                  :aria-label="`Select ${metric.item.path} for bulk actions`"
                  @change="toggleEntryChecked(metric.item.id)"
                  @click.stop
                />
              </label>
            </div>
          </template>
        </div>
      </div>
      <footer class="flex shrink-0 flex-col gap-1.5 border-t border-border bg-muted/10 px-2 py-2">
        <div class="flex items-center justify-between gap-2">
          <p
            v-if="branchLine"
            class="min-w-0 truncate font-mono text-[9px] text-muted-foreground"
            :title="branchLine"
          >
            {{ branchLine }}
          </p>
          <span v-else class="text-[9px] text-muted-foreground">—</span>
          <BaseButton
            v-if="scmFetchAvailable"
            type="button"
            size="xs"
            variant="outline"
            class="h-6 shrink-0 gap-1 px-2 text-[10px]"
            :disabled="scmFetchBusy"
            aria-label="Fetch from remote"
            @click="emit('fetch')"
          >
            <Loader2 v-if="scmFetchBusy" class="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
            <RefreshCw v-else class="h-3 w-3 shrink-0" aria-hidden="true" />
            Fetch
          </BaseButton>
        </div>

        <div class="relative">
          <textarea
            v-model="commitMessage"
            rows="4"
            placeholder="Enter commit message"
            aria-label="Commit message draft"
            class="w-full resize-y rounded-md border border-border bg-background py-1.5 pr-7 pl-2 font-mono text-[10px] leading-snug text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30"
            :class="commitExpanded ? 'min-h-[11rem]' : 'min-h-[4.5rem]'"
          />
          <button
            type="button"
            class="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="commitExpanded ? 'Shrink editor' : 'Expand editor'"
            :aria-label="commitExpanded ? 'Shrink commit message editor' : 'Expand commit message editor'"
            @click="commitExpanded = !commitExpanded"
          >
            <Minimize2 v-if="commitExpanded" class="h-3 w-3" aria-hidden="true" />
            <Maximize2 v-else class="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div class="flex items-center justify-between gap-2">
          <button
            v-if="lastCommitSubject"
            type="button"
            class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/25 px-2 py-1 text-left text-[9px] text-muted-foreground hover:bg-muted/45"
            :title="`Use message from last commit: ${lastCommitSubject}`"
            @click="applyLastCommitSubject"
          >
            <span class="truncate font-mono">{{ lastCommitSubject }}</span>
            <Undo2 class="h-3 w-3 shrink-0 opacity-80" aria-hidden="true" />
          </button>
          <span v-else class="min-w-0 flex-1" />
          <BaseButton
            type="button"
            size="xs"
            variant="default"
            class="h-7 shrink-0 px-3 text-[10px]"
            :disabled="!canCommit"
            aria-label="Commit staged changes"
            @click="emit('commit')"
          >
            <Loader2 v-if="scmCommitBusy" class="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
            Commit
          </BaseButton>
        </div>

      </footer>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex min-h-9 items-center gap-2 border-b border-border px-3 py-1.5">
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-[11px] text-foreground">
            {{ selectedEntry?.path ?? "No file selected" }}
          </p>
          <p class="text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            {{ selectedEntry?.scope === "staged" ? "Staged changes" : selectedEntry?.scope === "unstaged" ? "Working tree changes" : "Diff" }}
          </p>
        </div>
      </header>

      <div ref="diffHostRef" class="min-h-0 flex-1 overflow-auto">
        <div v-if="diffLoading" class="flex h-full items-center justify-center text-[11px] text-muted-foreground">
          Loading diff…
        </div>
        <div
          v-else-if="emptyMessage"
          class="flex h-full items-center justify-center px-6 text-center text-[11px] text-muted-foreground"
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

/*
 * Line-by-line diffs rely on position:absolute gutter <td>s plus .d2h-code-line horizontal padding.
 * Do not set those <td>s to position:relative — it breaks the layout and hides the diff body.
 * Widen the gutter and match code-line inset so long line numbers do not clip.
 */
.diff-rich-host :deep(td.d2h-code-linenumber),
.diff-rich-host :deep(td.d2h-code-side-linenumber) {
  overflow: visible !important;
}

.diff-rich-host :deep(td.d2h-code-linenumber) {
  width: 11rem !important;
  max-width: 11rem !important;
}

.diff-rich-host :deep(td.d2h-code-side-linenumber) {
  width: 5.5rem !important;
  max-width: 5.5rem !important;
}

.diff-rich-host :deep(.line-num1),
.diff-rich-host :deep(.line-num2) {
  width: auto !important;
  min-width: 5ch !important;
  max-width: none !important;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  padding: 0 0.35rem !important;
  font-variant-numeric: tabular-nums !important;
}

.diff-rich-host :deep(.d2h-code-line),
.diff-rich-host :deep(.d2h-code-side-line) {
  padding: 0 0.5rem 0 11.5rem !important;
  width: auto !important;
  max-width: none !important;
}
</style>
