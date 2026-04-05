<script setup lang="ts">
import type { Project, Worktree } from "@shared/domain";
import { Plus } from "lucide-vue-next";
import { computed, ref } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import Badge from "@/components/ui/Badge.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";

const props = defineProps<{
  projects: Project[];
  worktrees: Worktree[];
  activeProjectId: string | null;
}>();

const emit = defineEmits<{
  select: [projectId: string];
  create: [];
}>();

const tabTriggerBase =
  "inline-flex h-[calc(100%-1px)] shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const tabTriggerActive =
  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground";

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
</script>

<template>
  <nav class="flex flex-col gap-1 border-b border-border px-2 py-1" aria-label="Projects">
    <div class="flex min-h-7 w-full max-w-full items-center gap-3">
      <div class="flex shrink-0 items-center gap-2">
        <span class="font-instrument text-xl leading-none tracking-tight text-foreground">Instrumental</span>
        <Badge
          variant="secondary"
          class="h-5 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider"
        >
          Alpha
        </Badge>
      </div>
      <div
        role="tablist"
        class="inline-flex h-7 w-fit max-w-full shrink-0 items-center justify-start gap-0.5 overflow-x-auto rounded-md bg-muted p-0.5 text-muted-foreground [scrollbar-width:thin]"
      >
        <button
          v-for="project in projects"
          :key="project.id"
          type="button"
          role="tab"
          :aria-selected="project.id === activeProjectId"
          :class="[tabTriggerBase, project.id === activeProjectId ? tabTriggerActive : '']"
          @click="emit('select', project.id)"
          @mouseenter="onTabEnter(project.id, $event)"
          @mouseleave="onTabLeave"
        >
          {{ project.name }}
        </button>
        <BaseButton
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label="Create project"
          title="Create project"
          @click="emit('create')"
        >
          <Plus />
        </BaseButton>
      </div>
      <div class="ml-auto shrink-0">
        <ThemeToggle />
      </div>
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
      <p class="mt-2 border-t border-border pt-2 text-xs text-foreground">
        {{ terminalLine }}
      </p>
    </div>
  </Teleport>
</template>
