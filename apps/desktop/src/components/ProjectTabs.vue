<script setup lang="ts">
import type { Project, RunStatus, Thread, Worktree } from "@shared/domain";
import { Plus, Settings, X } from "lucide-vue-next";
import { ref } from "vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import Button from "@/components/ui/Button.vue";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";
import type { KeybindingId } from "@/keybindings/registry";
import { shortcutForModDigitSlot } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const keybindings = useKeybindingsStore();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

const props = withDefaults(
  defineProps<{
    projects: Project[];
    worktrees: Worktree[];
    activeProjectId: string | null;
    /** All threads (across projects) for hover summary counts. */
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
  "flex w-full py-1 max-w-full select-none items-center gap-px border-b border-zinc-300/80 bg-zinc-200/95 px-1 dark:border-zinc-800 dark:bg-zinc-950";

const tabListClass =
  "inline-flex h-full min-w-0 max-w-full flex-1 items-center gap-0.5 overflow-x-auto pr-0.5 [scrollbar-width:thin]";

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

function onProjectHoverOpenChange(open: boolean): void {
  if (open) void refreshPtySessions();
}

function projectTabTitle(projectName: string, index: number): string {
  const hint = shortcutForModDigitSlot(index);
  return hint ? `${projectName} (${hint})` : projectName;
}

function onRemoveClick(projectId: string, event: MouseEvent): void {
  event.stopPropagation();
  emit("remove", projectId);
}
</script>

<template>
  <nav :class="tabChrome" aria-label="Projects">
    <div
      role="tablist"
      :class="tabListClass"
    >
      <HoverCard
        v-for="(project, projectIndex) in projects"
        :key="project.id"
        :open-delay="120"
        :close-delay="0"
        @update:open="(open) => onProjectHoverOpenChange(open)"
      >
        <div
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
        >
          <HoverCardTrigger as-child>
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
              @click="emit('select', project.id)"
            >
              <span class="shrink-0 text-sm leading-none" aria-hidden="true">📁</span>
              <span class="min-w-0 truncate">{{ project.name }}</span>
            </Button>
          </HoverCardTrigger>
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
                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              'mt-1.5 me-1'
            ]"
            :aria-label="`Remove ${project.name} from workspace tabs`"
            :title="`Remove ${project.name}`"
            @click="onRemoveClick(project.id, $event)"
          >
            <X class="h-3.5 w-3.5" :stroke-width="1.75" />
          </Button>
          <HoverCardContent
            role="tooltip"
            class="pointer-events-none w-[min(22rem,calc(100vw-1.5rem))] rounded-lg p-3 text-popover-foreground shadow-lg"
          >
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
            <p class="mt-1 break-all font-mono text-xs text-foreground">
              {{ project.repoPath }}
            </p>
            <template v-if="projectWorktrees(project.id).length > 1">
              <p class="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Worktrees</p>
              <ul class="mt-1 max-h-24 space-y-0.5 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                <li
                  v-for="worktree in projectWorktrees(project.id)"
                  :key="worktree.id"
                  class="break-all"
                >
                  {{ worktree.path }}
                </li>
              </ul>
            </template>
            <p class="mt-2 border-t border-border pt-2 text-xs text-foreground">
              {{
                !hasPtySessionApi()
                  ? "Terminal: status available in the desktop app"
                  : terminalStatusLoading
                    ? "Terminal: …"
                    : projectWorktrees(project.id).some((worktree) => ptyWorktreeIds.has(worktree.id))
                      ? "Terminal: session open (integrated shell running)"
                      : "Terminal: no session yet"
              }}
            </p>
          </HoverCardContent>
        </div>
      </HoverCard>
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
</template>
