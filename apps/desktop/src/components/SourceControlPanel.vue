<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Undo2
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import ScmBranchCombobox from "@/components/ScmBranchCombobox.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { FileMergeSidesResult, RepoStatusEntry } from "@shared/ipc";
import MonacoDiffEditor from "@/components/MonacoDiffEditor.vue";

const SCM_DIFF_LAYOUT_KEY = "instrument.scmDiffLayout";
type ScmDiffLayout = "split" | "unified";

function readScmDiffLayout(): ScmDiffLayout {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SCM_DIFF_LAYOUT_KEY) === "unified"
      ? "unified"
      : "split";
  } catch {
    return "split";
  }
}

const scmDiffLayout = ref<ScmDiffLayout>(readScmDiffLayout());

watch(scmDiffLayout, (v) => {
  try {
    localStorage.setItem(SCM_DIFF_LAYOUT_KEY, v);
  } catch {
    /* ignore quota / private mode */
  }
});

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
    /** Short `HEAD` name for branch switcher (same source as `RepoScmSnapshot.branch`). */
    scmBranch?: string;
    projectId?: string | null;
    /** Active worktree path (repo status / checkout cwd). */
    scmCwd?: string | null;
    /** Allow in-panel branch checkout; off when the project uses linked worktrees (sidebar layout). */
    allowScmBranchSwitcher?: boolean;
    /** Latest commit subject from `git log -1`; shown as a one-click draft hint. */
    lastCommitSubject?: string | null;
    /** Active worktree label shown in the panel chrome. */
    contextLabel?: string | null;
    /** Desktop preload exposes `gitFetch`. */
    scmFetchAvailable?: boolean;
    /** Desktop preload exposes `gitPush`. */
    scmPushAvailable?: boolean;
    scmCommitAvailable?: boolean;
    scmFetchBusy?: boolean;
    scmPushBusy?: boolean;
    scmCommitBusy?: boolean;
    selectedPath: string | null;
    selectedScope: EntryScope | null;
    mergeResult: FileMergeSidesResult | null;
    mergeLoading: boolean;
    /** Thread id for context-queue capture in the diff viewer. */
    activeThreadId?: string | null;
  }>(),
  {
    branchLine: null,
    scmBranch: "",
    projectId: null,
    scmCwd: null,
    allowScmBranchSwitcher: false,
    lastCommitSubject: null,
    contextLabel: null,
    scmFetchAvailable: false,
    scmPushAvailable: false,
    scmCommitAvailable: false,
    scmFetchBusy: false,
    scmPushBusy: false,
    scmCommitBusy: false,
    activeThreadId: null
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
  push: [];
  commit: [];
  openFileInEditor: [path: string];
  branchChanged: [];
}>();

/** Max characters for the directory prefix before we collapse with `…/` (filename stays full). */
const SCM_PATH_DIR_MAX_CHARS = 44;

function splitRepoPath(path: string): { dir: string; base: string } {
  const norm = path.replace(/\\/g, "/").trim();
  if (!norm) return { dir: "", base: "" };
  const i = norm.lastIndexOf("/");
  if (i < 0) return { dir: "", base: norm };
  return { dir: norm.slice(0, i), base: norm.slice(i + 1) };
}

/** Keep folders nearest the file; prepend `…/` for omitted parents (leading truncation). */
function shortenDirPrefix(dir: string, maxLen: number): string {
  if (dir.length <= maxLen) return dir;
  const parts = dir.split("/").filter(Boolean);
  const picked: string[] = [];
  let used = 2;
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i]!;
    const next = used + seg.length + (picked.length > 0 ? 1 : 0);
    if (next > maxLen) break;
    picked.unshift(seg);
    used = next;
  }
  if (picked.length === 0) {
    const tail = dir.slice(Math.max(0, dir.length - (maxLen - 1)));
    return `…${tail}`;
  }
  return `…/${picked.join("/")}`;
}

/** Fixed row heights for virtualized sidebar (must match template layout). */
const SECTION_ROW_PX = 22;
const ENTRY_ROW_PX = 32;
/** Extra top padding + border lane after staged block, before working tree. */
const SECTION_MAJOR_GAP_PX = 10;
const sidebarScrollRef = ref<HTMLElement | null>(null);
const sidebarViewportHeight = ref(320);
const sidebarScrollTop = ref(0);
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
const collapsedSections = ref<Set<SectionId>>(new Set());

function toggleSection(id: SectionId): void {
  const next = new Set(collapsedSections.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedSections.value = next;
}

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
    const collapsed = collapsedSections.value.has(id);
    if (id === "staged") {
      out.push({ kind: "section", id, label, count: entries.length });
      if (!collapsed) out.push(...entries);
      placedStagedBlock = true;
      needMajorDividerBeforeNextSection = true;
      continue;
    }
    const majorDividerAbove = needMajorDividerBeforeNextSection && placedStagedBlock;
    needMajorDividerBeforeNextSection = false;
    out.push({ kind: "section", id, label, count: entries.length, majorDividerAbove });
    if (!collapsed) out.push(...entries);
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

/** Path line: full basename + shortened parent path; `title` carries the full relative path. */
const scmPathHeader = computed(() => {
  const path = selectedEntry.value?.path ?? "";
  if (!path) return { full: "", base: "", dirLine: "", hasDir: false };
  const { dir, base } = splitRepoPath(path);
  const dirLine = dir ? shortenDirPrefix(dir, SCM_PATH_DIR_MAX_CHARS) : "";
  return { full: path, base, dirLine, hasDir: Boolean(dir) };
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

const emptyMessage = computed(() => {
  if (totalChanges.value === 0) return "✨ Working tree is clean.";
  if (!selectedEntry.value) return "Select a changed file to inspect it.";
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
    // Parent may apply selection in the same flush as repoStatus; avoid duplicate emits.
    if (selectedEntry.value) return;
    selectEntry(firstEntry.path, firstEntry.scope);
  },
  { immediate: true, flush: "post" }
);

onMounted(() => {
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
  sidebarResizeObserver?.disconnect();
  sidebarResizeObserver = null;
});
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-[11px] text-foreground">
    <aside class="flex min-h-0 w-[272px] shrink-0 flex-col border-r border-border bg-muted/20">
      <header
        class="flex h-9 items-center border-b border-border px-2"
        aria-label="Source control"
      >
        <div class="flex w-full items-center justify-between gap-1.5">
          <div class="flex min-w-0 items-center gap-1.5">
            <p class="text-[10px] font-medium leading-none text-foreground">
              {{ totalChanges.toLocaleString() }} changes
            </p>            
          </div>
          <!-- Actions dropdown -->
          <DropdownMenu v-model:open="actionsOpen">
            <DropdownMenuTrigger as-child>
              <Button
                size="xs"
                variant="secondary"
                class="h-6 gap-1 px-2 text-[10px]"
              >
                Actions
                <ChevronDown class="h-3 w-3" :class="actionsOpen ? 'rotate-180' : ''" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="min-w-[180px]">
              <DropdownMenuItem
                :disabled="!canStageFromSelection"
                class="text-xs"
                @select="actionStageSelected"
              >
                <Plus class="h-3 w-3 shrink-0" />
                Stage Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="!canUnstageFromSelection"
                class="text-xs"
                @select="actionUnstageSelected"
              >
                <Minus class="h-3 w-3 shrink-0" />
                Unstage Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="!canDiscardFromSelection"
                variant="destructive"
                class="text-xs"
                @select="actionDiscardSelected"
              >
                <RotateCcw class="h-3 w-3 shrink-0" />
                Discard Selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-xs" @select="emit('stageAll')">
                <ChevronsUp class="h-3 w-3 shrink-0" />
                Stage All
              </DropdownMenuItem>
              <DropdownMenuItem class="text-xs" @select="emit('unstageAll')">
                <ChevronsDown class="h-3 w-3 shrink-0" />
                Unstage All
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" class="text-xs" @select="emit('discardAll')">
                <Trash2 class="h-3 w-3 shrink-0" />
                Discard All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                class="flex flex-1 cursor-pointer items-center justify-between gap-1 px-2 text-[9px] font-semibold tracking-[0.12em] uppercase"
                @click="toggleSection(metric.item.id)"
              >
                <span class="flex min-w-0 shrink items-center gap-1">
                  <ChevronDown
                    class="h-3 w-3 shrink-0 transition-transform duration-150"
                    :class="collapsedSections.has(metric.item.id) ? '-rotate-90' : ''"
                  />
                  <p>
                    {{ metric.item.label }}    
                  </p>                  
                </span>
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
              class="absolute inset-x-0 flex items-center"
              :class="[
                selectedPath === metric.item.path && selectedScope === metric.item.scope
                  ? 'z-[1] border-b border-primary/25 bg-primary/18 text-foreground ring-1 ring-inset ring-primary/30 dark:bg-primary/22'
                  : entryRowClasses(metric.item.sectionId)
              ]"
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
            >
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left transition-colors"
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
                <span
                  class="min-w-0 flex-1 overflow-hidden font-mono text-[10px] leading-tight"
                  :title="metric.item.path"
                >
                  <span class="block truncate font-semibold">{{ splitRepoPath(metric.item.path).base }}</span>
                  <span v-if="splitRepoPath(metric.item.path).dir" class="block truncate text-muted-foreground/70">{{ splitRepoPath(metric.item.path).dir }}</span>
                </span>
              </Button>
              <label
                class="flex self-stretch shrink-0 cursor-pointer items-center border-l border-border/40 bg-background/30 px-1.5 dark:bg-background/15"
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
      <footer class="flex shrink-0 flex-col border-t border-border bg-muted/10">
        <div class="flex items-center justify-between gap-2 px-2 py-1">
          <ScmBranchCombobox
            :branch-line="branchLine"
            :current-branch="scmBranch"
            :project-id="projectId ?? ''"
            :cwd="scmCwd ?? ''"
            :switcher-enabled="allowScmBranchSwitcher"
            @branch-changed="emit('branchChanged')"
          />
          <div
            v-if="scmFetchAvailable || scmPushAvailable"
            class="flex shrink-0 items-center gap-1"
          >
            <Button
              v-if="scmFetchAvailable"
              type="button"
              size="xs"
              variant="outline"
              class="h-6 shrink-0 gap-1 px-2 text-[10px]"
              :disabled="scmFetchBusy || scmPushBusy"
              aria-label="Fetch from remote"
              @click="emit('fetch')"
            >
              <Loader2 v-if="scmFetchBusy" class="h-2.5 w-2.5 shrink-0 animate-spin" aria-hidden="true" />
              <ArrowDownToLine
                v-else
                class="h-2.5 w-2.5 shrink-0 opacity-80"
                :stroke-width="2"
                aria-hidden="true"
              />
              Fetch
            </Button>
            <Button
              v-if="scmPushAvailable"
              type="button"
              size="xs"
              variant="outline"
              class="h-6 shrink-0 gap-1 px-2 text-[10px]"
              :disabled="scmPushBusy || scmFetchBusy"
              aria-label="Push current branch to remote"
              title="Push current branch (upstream must be set)"
              @click="emit('push')"
            >
              <Loader2 v-if="scmPushBusy" class="h-2.5 w-2.5 shrink-0 animate-spin" aria-hidden="true" />
              <ArrowUpFromLine
                v-else
                class="h-2.5 w-2.5 shrink-0 opacity-80"
                :stroke-width="2"
                aria-hidden="true"
              />
              Push
            </Button>
          </div>
        </div>

        <div class="relative">
          <textarea
            v-model="commitMessage"
            rows="4"
            placeholder="Enter commit message"
            aria-label="Commit message draft"
            class="w-full resize-none rounded-none border-0 border-t border-border bg-background py-1.5 pb-10 pl-2 pr-7 font-mono text-[10px] leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none"
            :class="commitExpanded ? 'min-h-[11rem]' : 'min-h-[4.5rem]'"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="commitExpanded ? 'Shrink editor' : 'Expand editor'"
            :aria-label="commitExpanded ? 'Shrink commit message editor' : 'Expand commit message editor'"
            @click="commitExpanded = !commitExpanded"
          >
            <Minimize2 v-if="commitExpanded" class="h-3 w-3" aria-hidden="true" />
            <Maximize2 v-else class="h-3 w-3" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="xs"
            variant="default"
            class="absolute bottom-2 right-2 h-7 shrink-0 px-3 text-[10px]"
            :disabled="!canCommit"
            aria-label="Commit staged changes"
            @click="emit('commit')"
          >
            <Loader2 v-if="scmCommitBusy" class="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
            Commit
          </Button>
        </div>
      </footer>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header class="flex h-9 min-w-0 items-center gap-2 overflow-x-auto border-b border-border px-2 whitespace-nowrap">
        <div
          class="min-w-0 flex-1 font-mono text-[10px] leading-tight"
          :title="scmPathHeader.full || undefined"
        >
          <template v-if="scmPathHeader.full">
            <p class="flex min-w-0 items-baseline justify-start gap-0">
              <span
                v-if="scmPathHeader.hasDir"
                class="min-w-0 shrink truncate text-muted-foreground"
              >{{ scmPathHeader.dirLine }}/</span>
              <span class="shrink-0 font-medium text-foreground">{{ scmPathHeader.base }}</span>
            </p>
          </template>
          <p v-else class="text-muted-foreground">No file selected</p>
          <p class="sr-only">
            File path: {{ scmPathHeader.full || "none" }}.
            {{
              selectedEntry?.scope === "staged"
                ? "Staged changes."
                : selectedEntry?.scope === "unstaged"
                  ? "Working tree changes."
                  : "Diff."
            }}
          </p>
        </div>
        <div
          v-if="selectedEntry && mergeResult?.kind === 'ok'"
          class="flex shrink-0 items-center gap-px rounded-md border border-border bg-muted/25 p-px"
          role="group"
          aria-label="Diff layout"
        >
          <Button
            type="button"
            size="xs"
            :variant="scmDiffLayout === 'split' ? 'default' : 'ghost'"
            class="h-6 rounded-sm px-2 text-[10px]"
            title="Two columns: original on the left, working copy on the right"
            :aria-pressed="scmDiffLayout === 'split'"
            @click="scmDiffLayout = 'split'"
          >
            Split
          </Button>
          <Button
            type="button"
            size="xs"
            :variant="scmDiffLayout === 'unified' ? 'default' : 'ghost'"
            class="h-6 rounded-sm px-2 text-[10px]"
            title="Single column: removed lines appear above the current file"
            :aria-pressed="scmDiffLayout === 'unified'"
            @click="scmDiffLayout = 'unified'"
          >
            Unified
          </Button>
        </div>
        <Button
          v-if="selectedEntry"
          type="button"
          size="xs"
          variant="outline"
          class="h-6 shrink-0 gap-1 px-2 text-[10px]"
          title="Open this file in the Files tab (current worktree)"
          aria-label="Go to file in editor"
          @click="emit('openFileInEditor', selectedEntry.path)"
        >
          <FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
          Go to file
        </Button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div v-if="mergeLoading" class="flex h-full items-center justify-center text-[11px] text-muted-foreground">
          Loading diff…
        </div>
        <div
          v-else-if="emptyMessage"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          role="status"
          aria-live="polite"
        >
          <span class="select-none text-4xl leading-none" aria-hidden="true">✨</span>
          <p class="max-w-xs text-xs text-muted-foreground">{{ emptyMessage.replace('✨ ', '') }}</p>
        </div>
        <div
          v-else-if="mergeResult?.kind === 'error'"
          class="flex h-full items-center justify-center px-4 text-center text-[11px] text-destructive"
          role="alert"
        >
          {{ mergeResult.message }}
        </div>
        <div
          v-else-if="mergeResult?.kind === 'binary'"
          class="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground"
          role="status"
        >
          Binary file — side-by-side text diff is not shown.
        </div>
        <div v-else-if="mergeResult?.kind === 'ok'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <p
            class="shrink-0 border-b border-border bg-muted/15 px-2 py-1 font-mono text-[10px] leading-tight text-muted-foreground"
          >
            <template v-if="scmDiffLayout === 'split'">
              <span class="font-medium text-foreground">{{ mergeResult.originalLabel }}</span>
              · left —
              <span class="font-medium text-foreground">{{ mergeResult.modifiedLabel }}</span>
              · right
            </template>
            <template v-else>
              Unified —
              <span class="font-medium text-foreground">{{ mergeResult.originalLabel }}</span>
              vs
              <span class="font-medium text-foreground">{{ mergeResult.modifiedLabel }}</span>
            </template>
          </p>
          <MonacoDiffEditor
            class="min-h-0 flex-1"
            :layout="scmDiffLayout"
            :original="mergeResult.original"
            :modified="mergeResult.modified"
            :file-path="selectedEntry?.path ?? ''"
            :active-thread-id="props.activeThreadId"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@reference "../styles/globals.css";
</style>
