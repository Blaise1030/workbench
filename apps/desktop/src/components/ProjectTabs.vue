<script setup lang="ts">
import type { Project, RunStatus, Thread, Worktree } from "@shared/domain";
import { Plus, Settings, X } from "lucide-vue-next";
import type { CSSProperties } from "vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import Button from "@/components/ui/Button.vue";
import type { KeybindingId } from "@/keybindings/registry";
import { shortcutForModDigitSlot } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const FEEDBACK_ISSUES_URL = "https://github.com/Blaise1030/instrumental/issues/new";

const keybindings = useKeybindingsStore();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

async function openFeedbackIssue(): Promise<void> {
  await window.workspaceApi?.openAppExternalUrl?.(FEEDBACK_ISSUES_URL);
}

const props = withDefaults(
  defineProps<{
    projects: Project[];
    worktrees: Worktree[];
    activeProjectId: string | null;
    /** All threads (across projects) for attention chrome on tabs. */
    threads?: readonly Thread[];
    /** Matches ThreadSidebar: background idle completion on a non-visible PTY. */
    idleAttentionByThreadId?: Readonly<Record<string, boolean>>;
    /** Derived agent run status from PTY (needs review, failed, etc.). */
    runStatusByThreadId?: Readonly<Record<string, RunStatus>>;
  }>(),
  {
    threads: () => [],
    idleAttentionByThreadId: () => ({}),
    runStatusByThreadId: () => ({})
  }
);

const emit = defineEmits<{
  select: [projectId: string];
  remove: [projectId: string];
  /** New left-to-right order after drag-and-drop. */
  reorder: [orderedProjectIds: string[]];
  create: [];
  configureCommands: [];
}>();

/** Browser-style tab strip: inactive = text on chrome; active = muted surface. */
const tabChrome =
  "relative z-0 flex w-full overflow-visible py-1 max-w-full select-none items-center gap-px border-b border-zinc-300/80 bg-zinc-200/95 px-1 dark:border-zinc-800 dark:bg-zinc-950";

const tabListClass =
  "inline-flex h-full min-w-0 max-w-full flex-1 items-center gap-0.5 overflow-x-auto overflow-y-visible pr-0.5 [scrollbar-width:thin]";

const tabInactive =
  "inline-flex max-w-[14rem] shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-0.5 text-left text-xs font-medium whitespace-nowrap text-zinc-600 transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:focus-visible:ring-offset-zinc-950";

const tabActive =
  "bg-card font-medium text-foreground shadow-sm";

const tabInactiveInteractive =
  "hover:bg-zinc-300/50 hover:text-zinc-900 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200";

const newTabBtnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-zinc-600 transition-colors hover:bg-zinc-300/60 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-offset-zinc-950";

const tabItemClass =
  "group relative flex max-w-[14rem] shrink-0 cursor-grab items-stretch active:cursor-grabbing";

const tabButtonClass =
  "inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-0.5 text-left text-xs font-medium whitespace-nowrap text-zinc-600 transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:focus-visible:ring-offset-zinc-950";

const tabCloseButtonClass =
  "absolute inset-y-0 right-1 my-auto inline-flex h-5 w-5 items-center justify-center rounded-md border border-transparent text-zinc-500 transition-colors hover:bg-zinc-300/80 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-offset-zinc-950";

const ptyWorktreeIds = ref<Set<string>>(new Set());
const terminalStatusLoading = ref(false);

const draggingProjectId = ref<string | null>(null);

function reorderProjectIds(fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex) return props.projects.map((p) => p.id);
  const ids = props.projects.map((p) => p.id);
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);
  return ids;
}

function onTabDragStart(projectId: string, event: DragEvent): void {
  draggingProjectId.value = projectId;
  event.dataTransfer?.setData("text/plain", projectId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function onTabDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function onTabDrop(targetIndex: number, event: DragEvent): void {
  event.preventDefault();
  const id = event.dataTransfer?.getData("text/plain") || draggingProjectId.value;
  draggingProjectId.value = null;
  if (!id) return;
  const fromIndex = props.projects.findIndex((p) => p.id === id);
  if (fromIndex < 0) return;
  const next = reorderProjectIds(fromIndex, targetIndex);
  const same =
    next.length === props.projects.length && next.every((pid, i) => pid === props.projects[i]?.id);
  if (!same) emit("reorder", next);
}

function onTabDragEnd(): void {
  draggingProjectId.value = null;
}

function projectWorktrees(projectId: string): Worktree[] {
  return props.worktrees.filter((worktree) => worktree.projectId === projectId);
}

function projectThreads(projectId: string): readonly Thread[] {
  return props.threads.filter((thread) => thread.projectId === projectId);
}

/** Highest-priority attention for any thread in this project (for tab chrome). */
function projectAttentionLevel(projectId: string): "failed" | "review" | "idle" | null {
  let hasIdle = false;
  for (const thread of projectThreads(projectId)) {
    if (props.idleAttentionByThreadId[thread.id]) hasIdle = true;
    const rs = props.runStatusByThreadId[thread.id];
    if (rs === "failed") return "failed";
    if (rs === "needsReview") return "review";
  }
  if (hasIdle) return "idle";
  return null;
}

function projectAttentionTabClass(projectId: string): string {
  const level = projectAttentionLevel(projectId);
  if (!level) return "";
  const attentionBackground = "bg-blue-500/12 dark:bg-blue-400/18";
  switch (level) {
    case "failed":
      return `${attentionBackground} ring-1 ring-red-500/55 ring-inset dark:ring-red-400/45`;
    case "review":
      return `${attentionBackground} ring-1 ring-orange-500/55 ring-inset dark:ring-orange-400/45`;
    case "idle":
      return `${attentionBackground} ring-1 ring-blue-500/55 ring-inset dark:ring-blue-400/45`;
    default:
      return "";
  }
}

function tabButtonTitle(projectName: string, projectId: string, projectIndex: number): string {
  const level = projectAttentionLevel(projectId);
  const base = projectTabTitle(projectName, projectIndex);
  if (!level) return base;
  const hint =
    level === "failed"
      ? "Action needed (failed run)"
      : level === "review"
        ? "Needs your review"
        : "Needs attention (agent idle)";
  return `${base} — ${hint}`;
}

async function refreshPtySessions(): Promise<void> {
  const api = window.workspaceApi;
  if (!api?.ptyListSessions) return;
  terminalStatusLoading.value = true;
  try {
    const ids = await api.ptyListSessions();
    ptyWorktreeIds.value = new Set(ids);
  } catch {
    ptyWorktreeIds.value = new Set();
  } finally {
    terminalStatusLoading.value = false;
  }
}

function hasPtySessionApi(): boolean {
  return typeof window !== "undefined" && Boolean(window.workspaceApi?.ptyListSessions);
}

function projectTabTitle(projectName: string, index: number): string {
  const hint = shortcutForModDigitSlot(index);
  return hint ? `${projectName} (${hint})` : projectName;
}

function onRemoveClick(projectId: string, event: MouseEvent): void {
  event.stopPropagation();
  emit("remove", projectId);
}

/** Tab strip uses horizontal scroll; abs children are clipped — float panel on `body` instead. */
const hoveredDetailsProjectId = ref<string | null>(null);
const detailsAnchorEl = ref<HTMLElement | null>(null);
const detailsPanelStyle = ref<CSSProperties>({});
const detailsPanelRef = ref<HTMLElement | null>(null);

let detailsHideTimer: ReturnType<typeof setTimeout> | null = null;

function cancelDetailsHideTimer(): void {
  if (detailsHideTimer !== null) {
    clearTimeout(detailsHideTimer);
    detailsHideTimer = null;
  }
}

function syncDetailsPanelPosition(): void {
  const el = detailsAnchorEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const margin = 12;
  const maxW = Math.min(22 * 16, window.innerWidth - 2 * margin);
  let left = r.left;
  if (left + maxW > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - maxW);
  }
  detailsPanelStyle.value = {
    position: "fixed",
    top: `${Math.round(r.bottom - 2)}px`,
    left: `${Math.round(left)}px`,
    width: `min(22rem, calc(100vw - ${2 * margin}px))`,
    zIndex: 200
  };
}

function hideProjectDetailsLater(): void {
  cancelDetailsHideTimer();
  detailsHideTimer = setTimeout(() => {
    hoveredDetailsProjectId.value = null;
    detailsAnchorEl.value = null;
    detailsHideTimer = null;
  }, 140);
}

function onDetailsPanelEnter(): void {
  cancelDetailsHideTimer();
}

function onDetailsPanelLeave(): void {
  hideProjectDetailsLater();
}

function onTabRowEnter(project: Project, event: MouseEvent): void {
  cancelDetailsHideTimer();
  void refreshPtySessions();
  hoveredDetailsProjectId.value = project.id;
  detailsAnchorEl.value = event.currentTarget as HTMLElement;
  void nextTick(() => syncDetailsPanelPosition());
}

function onTabRowLeave(): void {
  hideProjectDetailsLater();
}

function dismissProjectDetailsNow(): void {
  cancelDetailsHideTimer();
  hoveredDetailsProjectId.value = null;
  detailsAnchorEl.value = null;
}

function onTabListScroll(): void {
  dismissProjectDetailsNow();
}

function onTabSelect(projectId: string): void {
  dismissProjectDetailsNow();
  emit("select", projectId);
}

function onTabRowFocusIn(project: Project, event: FocusEvent): void {
  cancelDetailsHideTimer();
  void refreshPtySessions();
  hoveredDetailsProjectId.value = project.id;
  detailsAnchorEl.value = event.currentTarget as HTMLElement;
  void nextTick(() => syncDetailsPanelPosition());
}

function onTabRowFocusOut(event: FocusEvent): void {
  const row = event.currentTarget as HTMLElement;
  const next = event.relatedTarget as Node | null;
  if (next && row.contains(next)) return;
  if (next && detailsPanelRef.value?.contains(next)) return;
  hideProjectDetailsLater();
}

const hoveredDetailsProject = computed(() =>
  props.projects.find((p) => p.id === hoveredDetailsProjectId.value) ?? null
);

function onWindowResize(): void {
  if (hoveredDetailsProjectId.value) syncDetailsPanelPosition();
}

onMounted(() => {
  window.addEventListener("resize", onWindowResize, { passive: true });
});

onBeforeUnmount(() => {
  cancelDetailsHideTimer();
  window.removeEventListener("resize", onWindowResize);
});
</script>

<template>
  <nav :class="tabChrome" aria-label="Projects">
    <div
      role="tablist"
      :class="tabListClass"
      @scroll.passive="onTabListScroll"
    >
      <div
        v-for="(project, projectIndex) in projects"
        :key="project.id"
        :class="[
          tabItemClass,
          draggingProjectId === project.id ? 'opacity-60' : ''
        ]"
        draggable="true"
        title="Drag to reorder tabs"
        :data-testid="`project-tab-row-${project.id}`"
        @dragstart="onTabDragStart(project.id, $event)"
        @dragover="onTabDragOver"
        @drop="onTabDrop(projectIndex, $event)"
        @dragend="onTabDragEnd"
        @mouseenter="onTabRowEnter(project, $event)"
        @mouseleave="onTabRowLeave"
        @focusin="onTabRowFocusIn(project, $event)"
        @focusout="onTabRowFocusOut"
      >
        <Button
            type="button"
            variant="ghost"
            role="tab"
            :data-project-id="project.id"
            :data-needs-attention="projectAttentionLevel(project.id) ?? undefined"
            :aria-selected="project.id === activeProjectId"
            :title="tabButtonTitle(project.name, project.id, projectIndex)"
            :aria-label="
              projectIndex < 9 ? `${project.name}, ${shortcutForModDigitSlot(projectIndex)}` : undefined
            "
            :class="[
              tabInactive,
              tabButtonClass,
              'pr-8',
              projectAttentionTabClass(project.id),
              project.id === activeProjectId ? tabActive : tabInactiveInteractive
            ]"
            @click="onTabSelect(project.id)"
          >
            <span class="shrink-0 text-sm leading-none" aria-hidden="true">📁</span>
            <span class="min-w-0 truncate">{{ project.name }}</span>
          </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          draggable="false"
          :data-testid="`remove-project-tab-${project.id}`"
          :class="[
            tabCloseButtonClass,
            'p-0',
            project.id === activeProjectId
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          ]"
          :aria-label="`Remove ${project.name} from workspace tabs`"
          :title="`Remove ${project.name}`"
          @click="onRemoveClick(project.id, $event)"
        >
          <X class="h-3.5 w-3.5" :stroke-width="1.75" />
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        :class="newTabBtnClass"
        aria-label="Create project"
        title="Create project"
        @click="emit('create')"
      >
        <Plus class="h-4 w-4" :stroke-width="1.75" />
      </Button>
    </div>
    <div class="ml-1 flex shrink-0 self-center items-center gap-0.5 border-l border-zinc-300/80 pl-1.5 dark:border-zinc-800">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        class="shrink-0"
        aria-label="Raise feedback"
        title="Raise an issue on GitHub"
        data-testid="workspace-feedback-button"
        @click="openFeedbackIssue"
      >
        <span aria-hidden="true" class="shrink-0 text-sm leading-none">💬</span>
        <span class="whitespace-nowrap">Raise feedback</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-zinc-600 transition-colors hover:bg-zinc-300/60 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-offset-zinc-950"
        aria-label="Settings"
        :title="titleWithShortcut('Settings', 'openSettings')"
        @click="emit('configureCommands')"
      >
        <Settings class="size-[18px]" :stroke-width="1.9" />
      </Button>
      <ThemeToggle
        variant="ghost"
        size="icon-sm"
        class="h-8 w-8 text-zinc-600 hover:bg-zinc-300/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      />
    </div>
  </nav>
  <Teleport to="body">
    <div
      v-if="hoveredDetailsProject"
      ref="detailsPanelRef"
      :data-testid="`project-hover-details-${hoveredDetailsProject.id}`"
      :style="detailsPanelStyle"
      class="pt-0.5"
      @mouseenter="onDetailsPanelEnter"
      @mouseleave="onDetailsPanelLeave"
    >
      <div
        class="rounded-lg border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-sm"
      >
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
          <p class="mt-0.5 break-all font-mono text-[11px] leading-snug text-foreground">
            {{ hoveredDetailsProject.repoPath }}
          </p>
        </div>
        <template v-if="projectWorktrees(hoveredDetailsProject.id).length > 1">
          <div>
            <p class="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Worktrees</p>
            <ul class="mt-0.5 max-h-36 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
              <li
                v-for="worktree in projectWorktrees(hoveredDetailsProject.id)"
                :key="worktree.id"
                class="break-all rounded-sm py-0.5 font-mono text-[11px] leading-snug text-muted-foreground transition-colors duration-150 hover:bg-muted/30 hover:text-foreground"
              >
                {{ worktree.path }}
              </li>
            </ul>
          </div>
        </template>
        <div class="mt-1.5 border-t border-border pt-1.5">
          <p class="text-[11px] leading-snug text-foreground">
            {{
              !hasPtySessionApi()
                ? "Terminal: status available in the desktop app"
                : terminalStatusLoading
                  ? "Terminal: …"
                  : projectWorktrees(hoveredDetailsProject.id).some((worktree) => ptyWorktreeIds.has(worktree.id))
                    ? "Terminal: session open (integrated shell running)"
                    : "Terminal: no session yet"
            }}
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
