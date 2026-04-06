<script setup lang="ts">
import type { Project, Thread, Worktree } from "@shared/domain";
import { Plus, Settings } from "lucide-vue-next";
import { computed, ref } from "vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import { shortcutForModDigitSlot, titleWithShortcut } from "@/keybindings/registry";

const props = withDefaults(
  defineProps<{
    projects: Project[];
    worktrees: Worktree[];
    activeProjectId: string | null;
    /** All threads (across projects) for hover summary counts. */
    threads?: readonly Thread[];
    /** Thread ids with unviewed terminal attention (bell / background output). */
    threadIdsNeedingAttention?: ReadonlySet<string>;
    /** Projects where some thread has terminal attention while that thread was not visible. */
    projectIdsNeedingAttention?: ReadonlySet<string>;
  }>(),
  { threads: () => [] }
);

function tabNeedsAttention(projectId: string): boolean {
  return props.projectIdsNeedingAttention?.has(projectId) ?? false;
}

const emit = defineEmits<{
  select: [projectId: string];
  create: [];
  configureCommands: [];
}>();

/** Browser-style tab strip: inactive = text on chrome; active = muted surface. */
const tabChrome =
  "flex h-10 w-full max-w-full items-center gap-px border-b border-zinc-300/80 bg-zinc-200/95 px-1 dark:border-zinc-800 dark:bg-zinc-950";

const tabListClass =
  "inline-flex h-full min-w-0 max-w-full flex-1 items-center gap-0.5 overflow-x-auto pr-0.5 [scrollbar-width:thin]";

const tabInactive =
  "inline-flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-0.5 text-left text-xs font-medium whitespace-nowrap text-zinc-600 transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:focus-visible:ring-offset-zinc-950";

const tabActive =
  "bg-card font-medium text-foreground shadow-sm";

const tabInactiveInteractive =
  "hover:bg-zinc-300/50 hover:text-zinc-900 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-200";

const newTabBtnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-zinc-600 transition-colors hover:bg-zinc-300/60 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-offset-zinc-950";

const hoverCardProjectId = ref<string | null>(null);
const hoverCardStyle = ref<{ left: string; top: string }>({ left: "0px", top: "0px" });
const ptyWorktreeIds = ref<Set<string>>(new Set());
const terminalStatusLoading = ref(false);

const hoveredProject = computed(() =>
  hoverCardProjectId.value ? props.projects.find((p) => p.id === hoverCardProjectId.value) : undefined
);

const hoveredWorktrees = computed(() =>
  hoverCardProjectId.value
    ? props.worktrees.filter((w) => w.projectId === hoverCardProjectId.value)
    : []
);

/** Threads in the hovered project that have unviewed terminal attention only. */
const hoveredThreadsNeedingAttention = computed(() => {
  const pid = hoverCardProjectId.value;
  const need = props.threadIdsNeedingAttention;
  if (!pid || !need?.size) return [];
  return props.threads.filter((t) => t.projectId === pid && need.has(t.id));
});

const terminalLine = computed(() => {
  if (!hoverCardProjectId.value) return "";
  const api = typeof window !== "undefined" ? window.workspaceApi : undefined;
  if (!api?.ptyListSessions) {
    return "Terminal: status available in the desktop app";
  }
  if (terminalStatusLoading.value) return "Terminal: …";
  const ids = hoveredWorktrees.value.map((w) => w.id);
  const any = ids.some((id) => ptyWorktreeIds.value.has(id));
  return any ? "Terminal: session open (integrated shell running)" : "Terminal: no session yet";
});

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

function onTabEnter(projectId: string, event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  hoverCardStyle.value = {
    left: `${Math.round(r.left)}px`,
    top: `${Math.round(r.bottom + 6)}px`
  };
  hoverCardProjectId.value = projectId;
  void refreshPtySessions();
}

function onTabLeave(): void {
  hoverCardProjectId.value = null;
}

function projectTabTitle(projectName: string, index: number): string {
  const hint = shortcutForModDigitSlot(index);
  return hint ? `${projectName} (${hint})` : projectName;
}
</script>

<template>
  <nav :class="tabChrome" aria-label="Projects">
    <div
      role="tablist"
      :class="tabListClass"
    >
      <button
        v-for="(project, projectIndex) in projects"
        :key="project.id"
        type="button"
        role="tab"
        :data-project-id="project.id"
        :aria-selected="project.id === activeProjectId"
        :title="projectTabTitle(project.name, projectIndex)"
        :aria-label="
          tabNeedsAttention(project.id)
            ? `${project.name}, thread needs attention`
            : projectIndex < 9
              ? `${project.name}, ${shortcutForModDigitSlot(projectIndex)}`
              : undefined
        "
        :class="[
          tabInactive,
          project.id === activeProjectId ? tabActive : tabInactiveInteractive,
          tabNeedsAttention(project.id)
            ? 'relative z-[1] ring-2 ring-inset ring-blue-600 dark:ring-blue-400'
            : ''
        ]"
        @click="emit('select', project.id)"
        @mouseenter="onTabEnter(project.id, $event)"
        @mouseleave="onTabLeave"
      >
        <span
          class="shrink-0 text-sm leading-none"
          :class="tabNeedsAttention(project.id) ? 'relative z-[1] animate-pulse' : ''"
          aria-hidden="true"
        >📁</span>
        <span
          class="min-w-0 truncate"
          :class="tabNeedsAttention(project.id) ? 'relative z-[1]' : ''"
        >{{ project.name }}</span>
      </button>
      <button
        type="button"
        :class="newTabBtnClass"
        aria-label="Create project"
        title="Create project"
        @click="emit('create')"
      >
        <Plus class="h-4 w-4" :stroke-width="1.75" />
      </button>
    </div>
    <div class="ml-1 flex shrink-0 self-center items-center gap-0.5 border-l border-zinc-300/80 pl-1.5 dark:border-zinc-800">
      <button
        type="button"
        :class="newTabBtnClass"
        aria-label="Settings"
        :title="titleWithShortcut('Settings', 'openSettings')"
        @click="emit('configureCommands')"
      >
        <Settings class="h-3.5 w-3.5" :stroke-width="1.75" />
      </button>
      <ThemeToggle
        variant="ghost"
        size="icon"
        class="text-zinc-600 hover:bg-zinc-300/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      />
    </div>
  </nav>

  <Teleport to="body">
    <div
      v-if="hoveredProject"
      class="pointer-events-none fixed z-[200] w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      :style="hoverCardStyle"
      role="tooltip"
    >
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
      <p class="mt-1 break-all font-mono text-xs text-foreground">
        {{ hoveredProject.repoPath }}
      </p>
      <template v-if="hoveredWorktrees.length > 1">
        <p class="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Worktrees</p>
        <ul class="mt-1 max-h-24 space-y-0.5 overflow-y-auto font-mono text-[11px] text-muted-foreground">
          <li v-for="w in hoveredWorktrees" :key="w.id" class="break-all">
            {{ w.path }}
          </li>
        </ul>
      </template>
      <div
        v-if="hoveredThreadsNeedingAttention.length > 0"
        class="mt-2 border-t border-border pt-2"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Needs attention
          <span class="ml-1 tabular-nums text-foreground">({{ hoveredThreadsNeedingAttention.length }})</span>
        </p>
        <ul class="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-xs text-foreground">
          <li
            v-for="t in hoveredThreadsNeedingAttention"
            :key="t.id"
            class="truncate pl-0.5"
            :title="t.title"
          >
            {{ t.title }}
          </li>
        </ul>
      </div>
      <p class="mt-2 border-t border-border pt-2 text-xs text-foreground">
        {{ terminalLine }}
      </p>
    </div>
  </Teleport>
</template>
