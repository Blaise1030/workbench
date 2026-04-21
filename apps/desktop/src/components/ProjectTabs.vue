<script setup lang="ts">
import type { Project, RunStatus, Thread, Worktree } from "@shared/domain";
import type { AppUpdateAvailability } from "@shared/ipc";
import { ChevronDown, Download, FileText, Plus, Settings, X, PanelRightClose } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import Button from "@/components/ui/Button.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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

const appUpdate = ref<AppUpdateAvailability | null>(null);
const updatePopupOpen = ref(false);
const updateTriggerRef = ref<HTMLElement | null>(null);

onMounted(() => {
  void (async () => {
    if (import.meta.env.DEV) {
      appUpdate.value = { currentVersion: "0.0.1", latestVersion: "0.0.2", compareUrl: "#", releasePageUrl: "#" };
      updatePopupOpen.value = true;
    }

    const check = window.workspaceApi?.getAppUpdateAvailability;
    if (!check) return;
    try {
      const result = await check();
      if (result) {
        appUpdate.value = result;
        updatePopupOpen.value = true;
      }
    } catch {
      // ignore
    }
  })();
});

function dismissUpdate(): void {
  updatePopupOpen.value = false;
}

function openUpdatePopup(): void {
  updatePopupOpen.value = true;
}

async function openAppUpdateUrl(url: string): Promise<void> {
  await window.workspaceApi?.openAppExternalUrl?.(url);
}

const props = withDefaults(
  defineProps<{
    collapsed: boolean;
    projects: Project[];
    worktrees: Worktree[];
    activeProjectId: string | null;
    activeThreadId?: string | null;
    /** All threads (across projects) for attention chrome on tabs. */
    threads?: readonly Thread[];
    /** Matches ThreadSidebar: background idle completion on a non-visible PTY. */
    idleAttentionByThreadId?: Readonly<Record<string, boolean>>;
    /** Derived agent run status from PTY (needs review, failed, etc.). */
    runStatusByThreadId?: Readonly<Record<string, RunStatus>>;
  }>(),
  {
    activeThreadId: null,
    threads: () => [],
    idleAttentionByThreadId: () => ({}),
    runStatusByThreadId: () => ({})
  }
);

const emit = defineEmits<{
  select: [projectId: string];
  remove: [projectId: string];
  create: [];
  configureCommands: [];
  expand: []
}>();

const activeProject = computed(
  () => props.projects.find((p) => p.id === props.activeProjectId) ?? props.projects[0] ?? null
);

const activeProjectHasActiveThread = computed(() => {
  if (!props.activeThreadId || !activeProject.value) return false;
  return props.threads.some(
    (t) => t.id === props.activeThreadId && t.projectId === activeProject.value!.id
  );
});

const projectMenuOpen = ref(false);

/** Browser-style tab strip: inactive = text on chrome; active = muted surface. */
const tabChrome =
  "relative z-0 flex w-full overflow-visible max-w-full select-none items-center gap-px border-b border-zinc-300/80 bg-zinc-200/95 px-1 dark:border-zinc-800 dark:bg-zinc-950";

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

function projectTabTitle(projectName: string, index: number): string {
  const hint = shortcutForModDigitSlot(index);
  return hint ? `${projectName} (${hint})` : projectName;
}

function onProjectSwitcherChange(projectId: string): void {
  emit("select", projectId);
}
</script>

<template>
  <nav :class="tabChrome" aria-label="Projects">
    <Button
      v-if="collapsed"
      type="button"
      size="icon-sm"
      variant="outline"
      class="ms-1"
      aria-label="Expand threads sidebar"          
      @click="emit('expand')"
    >
      <PanelRightClose class="h-3.5 w-3.5" />
    </Button>
    <div class="h-5 border-r mx-1" />
    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden py-1 pr-0.5" data-testid="project-switcher">
      <DropdownMenu v-model:open="projectMenuOpen">
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :class="activeProjectHasActiveThread ? 'bg-accent' : ''"
            class="h-8 w-full min-w-0 justify-between gap-1.5 px-2 font-normal"
            :aria-label="`Active project: ${activeProject?.name ?? 'None'}`"
            :title="activeProject?.repoPath ?? undefined"
            data-testid="project-switcher-trigger"
          >
            <span class="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <span class="shrink-0 text-sm leading-none" aria-hidden="true">📁</span>
              <span class="min-w-0 truncate text-xs font-medium">{{ activeProject?.name ?? "—" }}</span>
            </span>
            <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="max-h-72 min-w-[var(--reka-dropdown-menu-trigger-width)] overflow-y-auto">
          <DropdownMenuRadioGroup
            :model-value="activeProjectId ?? ''"
            @update:model-value="onProjectSwitcherChange"
          >
            <DropdownMenuRadioItem
              v-for="(project, projectIndex) in projects"
              :key="project.id"
              :value="project.id"
              :title="tabButtonTitle(project.name, project.id, projectIndex)"
              :class="['text-xs', projectAttentionTabClass(project.id)]"
              :data-testid="`project-menu-item-${project.id}`"
            >
              <span class="min-w-0 truncate">{{ project.name }}</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <template v-if="activeProject && projects.length > 1">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              class="text-xs"
              data-testid="project-menu-remove-current"
              @select="emit('remove', activeProject.id)"
            >
              Remove "{{ activeProject.name }}"…
            </DropdownMenuItem>
          </template>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="text-xs"
            data-testid="project-menu-add"
            @select="emit('create')"
          >
            <Plus class="h-3.5 w-3.5" :stroke-width="1.75" />
            Add project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div
      class="ml-1 flex shrink-0 gap-1 self-center items-center gap-0.5 border-l border-zinc-300/80 pl-1.5 dark:border-zinc-800"
    >
      <div
        v-if="appUpdate"
        ref="updateTriggerRef"
        class="relative inline-flex shrink-0"
      >
        <Button
          type="button"
          variant="default"
          size="sm"
          class="shrink-0 !rounded-full"
          aria-label="Software update available"
          data-testid="project-tabs-update-trigger"
          @click="openUpdatePopup"
        >
          <span class="whitespace-nowrap">Update</span>
        </Button>

        <Transition name="ticket-popup">
          <div
            v-if="updatePopupOpen"
            :key="appUpdate.latestVersion"
            class="absolute top-full left-0 z-[9999] mt-2 w-64"
            data-testid="project-tabs-update-popup"
          >
            <div class="update-ticket relative overflow-hidden rounded-none px-2.5 pb-2.5 pt-2 text-foreground">
              <div
                class="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/[0.04] to-transparent dark:from-white/[0.06]"
                aria-hidden="true"
              />
              <header class="relative flex items-end justify-between gap-2 border-b border-dashed border-stone-800/20 pb-2 dark:border-stone-200/15">
                <div class="min-w-0">
                  <p class="text-[8px] font-semibold uppercase leading-none tracking-[0.22em] text-muted-foreground">
                    Software update
                  </p>
                  <p class="mt-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground/90">
                    REF-{{ appUpdate.latestVersion.replace(/\./g, "") }}
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <p
                    class="shrink-0 rounded-none border border-stone-800/15 bg-white/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums leading-none dark:border-stone-200/12 dark:bg-black/25"
                  >
                    RELEASE
                  </p>
                  <button
                    type="button"
                    class="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Dismiss update notification"
                    data-testid="project-tabs-update-dismiss"
                    @click="dismissUpdate"
                  >
                    <X class="h-3 w-3" />
                  </button>
                </div>
              </header>

              <div class="relative flex min-w-0 items-stretch gap-1.5 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Depart</p>
                  <p class="mt-0.5 truncate font-mono text-[15px] font-bold leading-none tabular-nums tracking-tight">
                    v{{ appUpdate.currentVersion }}
                  </p>
                </div>
                <div
                  class="flex shrink-0 flex-col items-center justify-center gap-0.5 px-0.5 text-muted-foreground"
                  aria-hidden="true"
                >
                  <div class="ticket-route-line" />
                  <span class="select-none text-base leading-none text-primary" aria-hidden="true">🚂</span>
                  <div class="ticket-route-line" />
                </div>
                <div class="min-w-0 flex-1 text-right">
                  <p class="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Arrive</p>
                  <p class="mt-0.5 truncate font-mono text-[15px] font-bold leading-none tabular-nums tracking-tight">
                    v{{ appUpdate.latestVersion }}
                  </p>
                </div>
              </div>
              <div class="ticket-perf mb-2" aria-hidden="true" />
              <div class="ticket-barcode mb-2.5" aria-hidden="true" />

              <div class="relative grid min-w-0 grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="flex h-auto min-h-8 min-w-0 flex-row items-center justify-center gap-1 border-stone-800/25 bg-white/55 px-1.5 py-1.5 text-stone-900 hover:bg-white/80 dark:border-stone-200/18 dark:bg-black/30 dark:text-stone-100 dark:hover:bg-black/45"
                  aria-label="View changelog"
                  data-testid="project-tabs-update-changelog"
                  @click="openAppUpdateUrl(appUpdate.compareUrl)"
                >
                  <FileText class="h-3.5 w-3.5 shrink-0" />
                  <span class="min-w-0 text-left text-[10px] font-semibold leading-snug">Changelog</span>
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  class="flex h-auto min-h-8 min-w-0 flex-row items-center justify-center gap-1 px-1.5 py-1.5 font-semibold"
                  aria-label="Download updated version"
                  data-testid="project-tabs-update-download"
                  @click="openAppUpdateUrl(appUpdate.releasePageUrl)"
                >
                  <Download class="h-3.5 w-3.5 shrink-0" />
                  <span class="min-w-0 text-left text-[10px] leading-snug">Download</span>
                </Button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-lg leading-none text-zinc-600 transition-colors hover:bg-zinc-300/60 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-offset-zinc-950"
        aria-label="Raise feedback"
        title="Raise an issue on GitHub"
        data-testid="workspace-feedback-button"
        @click="openFeedbackIssue"
      >
        <span aria-hidden="true">💬</span>      
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
</template>

<style scoped>
.ticket-popup-enter-active {
  transition:
    opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.ticket-popup-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.18s ease;
}

.ticket-popup-enter-from {
  opacity: 0;
  transform: translate3d(0, -0.5rem, 0);
}

.ticket-popup-leave-to {
  opacity: 0;
  transform: translate3d(0, -0.4rem, 0);
}

.update-ticket {
  transform: rotate(1deg);
  transform-origin: 50% 8%;
  background: linear-gradient(
    168deg,
    hsl(43 42% 97%) 0%,
    hsl(40 35% 94%) 42%,
    hsl(38 38% 91%) 100%
  );
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.55),
    0 1px 2px rgb(28 22 12 / 0.035),
    0 4px 10px rgb(28 22 12 / 0.055),
    0 0 0 1px rgb(55 48 40 / 0.09);
}

.dark .update-ticket {
  background: linear-gradient(168deg, hsl(28 14% 14%) 0%, hsl(26 12% 11%) 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.04),
    0 1px 3px rgb(0 0 0 / 0.2),
    0 6px 14px rgb(0 0 0 / 0.22),
    0 0 0 1px rgb(255 255 255 / 0.06);
}

.ticket-perf {
  border-top: 1px dashed rgb(62 53 42 / 0.28);
}

.dark .ticket-perf {
  border-top-color: rgb(255 255 255 / 0.14);
}

.ticket-barcode {
  height: 18px;
  border-radius: 0;
  background: repeating-linear-gradient(
    90deg,
    rgb(40 36 31 / 0.32) 0px,
    rgb(40 36 31 / 0.32) 1px,
    transparent 1px,
    transparent 3px
  );
}

.dark .ticket-barcode {
  background: repeating-linear-gradient(
    90deg,
    rgb(255 255 255 / 0.16) 0px,
    rgb(255 255 255 / 0.16) 1px,
    transparent 1px,
    transparent 3px
  );
}

.ticket-route-line {
  width: 2px;
  flex: 1;
  min-height: 5px;
  max-height: 11px;
  border-radius: 1px;
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in oklch, var(--primary) 48%, transparent),
    transparent
  );
}
</style>
