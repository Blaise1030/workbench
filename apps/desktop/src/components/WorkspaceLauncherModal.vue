<script setup lang="ts">
import { Folder, GitBranch, PanelLeft, Search } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import {
  parseLauncherQuery,
  searchLauncherCommands,
  searchLauncherRows,
  searchLauncherWorkspaceSwitch,
  type LauncherCommandId,
  type LauncherRow,
  type LauncherSectionId
} from "@/lib/workspaceLauncherSearch";
import { findDefinition, formatShortcut, shortcutForId } from "@/keybindings/registry";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { FileSummary } from "@shared/ipc";
import type { ThreadAgent } from "@shared/domain";

const open = defineModel<boolean>({ default: false });

const emit = defineEmits<{
  pickThread: [threadId: string];
  pickFile: [payload: { relativePath: string; worktreeId: string | null }];
  pickCommand: [id: LauncherCommandId];
  pickProject: [projectId: string];
  pickWorktree: [worktreeId: string];
}>();

const workspace = useWorkspaceStore();

const query = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const selectedIndex = ref(0);
const loading = ref(false);
const loadError = ref<string | null>(null);

const branchFiles = ref<{ relativePath: string }[]>([]);
const otherWorktreeFiles = ref<
  { worktreeId: string; worktreeName: string; files: { relativePath: string }[] }[]
>([]);

function getApi(): WorkspaceApi | null {
  return typeof window !== "undefined" && window.workspaceApi ? window.workspaceApi : null;
}

const parsed = computed(() => parseLauncherQuery(query.value));

const launcherToggleShortcutLabel = computed(() => {
  const def = findDefinition("workspaceLauncher");
  return def ? formatShortcut(def.shortcut) : "⌘K";
});

const commandSearchText = computed(() =>
  parsed.value.mode === "worktree" ? parsed.value.query : query.value
);

const commandShortcutHints = computed(() => ({
  "toggle-thread-sidebar": shortcutForId("toggleThreadSidebar")
}));

const rows = computed<LauncherRow[]>(() => {
  const cmds = searchLauncherCommands(commandSearchText.value, commandShortcutHints.value);
  const switchRows = searchLauncherWorkspaceSwitch(
    parsed.value,
    commandSearchText.value,
    workspace.projects,
    workspace.activeProjectId,
    workspace.worktrees,
    workspace.activeWorktreeId
  );
  const rest = searchLauncherRows(
    parsed.value,
    workspace.activeThreads,
    branchFiles.value,
    otherWorktreeFiles.value
  );
  return [...cmds, ...switchRows, ...rest];
});

const emptyHint = computed(() => {
  if (loading.value) return "Loading…";
  if (loadError.value) return loadError.value;
  if (parsed.value.mode === "worktree") {
    if (!query.value.startsWith("@wt")) return "";
    if (!parsed.value.query.trim()) {
      return otherWorktreeFiles.value.length === 0
        ? "No other worktrees in this project."
        : "Type to search files across linked worktrees.";
    }
  }
  if (!query.value.trim()) {
    return "Search commands, other workspaces and worktrees, threads, and files. Use @wt for files in linked worktrees.";
  }
  return "No results.";
});

async function loadIndexes(): Promise<void> {
  const api = getApi();
  const active = workspace.activeWorktree;
  const projectId = workspace.activeProjectId;
  loadError.value = null;
  branchFiles.value = [];
  otherWorktreeFiles.value = [];

  if (!api || !active || !projectId) {
    return;
  }

  loading.value = true;
  try {
    const listed = await api.listFiles(active.path);
    branchFiles.value = listed.map((f: FileSummary) => ({ relativePath: f.relativePath }));

    const others = workspace.worktrees.filter(
      (w) => w.projectId === projectId && w.id !== active.id
    );
    const blocks = await Promise.all(
      others.map(async (wt) => {
        try {
          const files = await api.listFiles(wt.path);
          return {
            worktreeId: wt.id,
            worktreeName: wt.name,
            files: files.map((f: FileSummary) => ({ relativePath: f.relativePath }))
          };
        } catch {
          return { worktreeId: wt.id, worktreeName: wt.name, files: [] as { relativePath: string }[] };
        }
      })
    );
    otherWorktreeFiles.value = blocks;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Could not load files.";
  } finally {
    loading.value = false;
  }
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  query.value = "";
  selectedIndex.value = 0;
  await loadIndexes();
  await nextTick();
  inputRef.value?.focus();
});

watch(
  () => ({ q: query.value, len: rows.value.length }),
  (cur, prev) => {
    if (!prev) return;
    if (cur.q !== prev.q) {
      const oldLen = prev.len;
      const newLen = cur.len;
      const idx = selectedIndex.value;
      const wasAtEnd = oldLen > 0 && idx === oldLen - 1;
      if (wasAtEnd) {
        selectedIndex.value = 0;
      } else if (idx >= newLen) {
        selectedIndex.value = Math.max(0, newLen - 1);
      }
    } else if (cur.len !== prev.len) {
      if (selectedIndex.value >= cur.len) {
        selectedIndex.value = Math.max(0, cur.len - 1);
      }
    }
  }
);

watch(selectedIndex, async () => {
  await nextTick();
  const list = listRef.value;
  if (!list) return;
  const opt = list.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  opt?.scrollIntoView({ block: "nearest", inline: "nearest" });
});

function close(): void {
  open.value = false;
}

function activateRow(row: LauncherRow): void {
  if (row.kind === "command") {
    emit("pickCommand", row.id);
  } else if (row.kind === "project") {
    emit("pickProject", row.projectId);
  } else if (row.kind === "worktree") {
    emit("pickWorktree", row.worktreeId);
  } else if (row.kind === "thread") {
    emit("pickThread", row.id);
  } else {
    emit("pickFile", { relativePath: row.relativePath, worktreeId: row.worktreeId });
  }
  close();
}

function onInputKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    close();
    return;
  }

  const list = rows.value;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    if (list.length === 0) return;
    selectedIndex.value = (selectedIndex.value + 1) % list.length;
    return;
  }
  if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (list.length === 0) return;
    selectedIndex.value = (selectedIndex.value - 1 + list.length) % list.length;
    return;
  }
  if (ev.key === "Enter") {
    ev.preventDefault();
    const row = list[selectedIndex.value];
    if (row) activateRow(row);
  }
}

const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

const SECTION_LABELS: Record<LauncherSectionId, string> = {
  commands: "Commands",
  workspace: "Workspace",
  worktrees: "Worktrees",
  agents: "Agents",
  files: "Files",
  linkedWorktrees: "Linked worktrees"
};

const SECTION_HINTS: Partial<Record<LauncherSectionId, string>> = {
  commands: "Quick actions",
  workspace: "Switch to another open workspace",
  worktrees: "Switch branch checkout in this project",
  agents: "Threads in this worktree",
  files: "Paths in the active worktree",
  linkedWorktrees: "Files in linked worktrees (@wt)"
};

function showSectionHeaderAt(i: number): boolean {
  const r = rows.value;
  if (r.length === 0) return false;
  if (i === 0) return true;
  return r[i]!.section !== r[i - 1]!.section;
}

/** Visible rule between section types (not above the first block). */
function showSectionDividerAbove(i: number): boolean {
  return showSectionHeaderAt(i) && i > 0;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace search"
    >
      <button
        type="button"
        class="absolute inset-0 workspace-launcher-scrim"
        aria-label="Close search"
        @click="close"
      />
      <div
        class="workspace-launcher-panel relative z-[301] flex w-full max-w-lg flex-col overflow-hidden rounded-lg text-popover-foreground"
        @click.stop
      >
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search commands, workspaces, threads, files…"
            autocomplete="off"
            spellcheck="false"
            data-testid="workspace-launcher-input"
            @keydown="onInputKeydown"
          />
        </div>
        <p class="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span class="font-mono">@wt</span>
          — search files in other worktrees (same project). Press
          <span class="font-mono">{{ launcherToggleShortcutLabel }}</span>
          to toggle.
        </p>

        <div
          ref="listRef"
          class="flex max-h-[min(50vh,320px)] flex-col gap-1 overflow-y-auto px-2 py-1"
          role="listbox"
          aria-label="Search results"
        >
          <template v-if="rows.length > 0">
            <template
              v-for="(row, i) in rows"
              :key="
                row.kind === 'thread'
                  ? `t-${row.id}`
                  : row.kind === 'command'
                    ? `c-${row.id}`
                    : row.kind === 'project'
                      ? `p-${row.projectId}`
                      : row.kind === 'worktree'
                        ? `w-${row.worktreeId}`
                        : `f-${row.worktreeId ?? 'main'}-${row.relativePath}`
              "
            >
              <template v-if="showSectionHeaderAt(i)">
                <div
                  v-if="showSectionDividerAbove(i)"
                  class="h-px shrink-0 bg-border"
                  role="presentation"
                />
                <div
                  class="px-3 pb-1"
                  :class="i === 0 ? 'pt-1' : 'pt-0.5'"
                  role="group"
                  :aria-label="SECTION_LABELS[row.section]"
                >
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {{ SECTION_LABELS[row.section] }}
                  </div>
                  <div
                    v-if="SECTION_HINTS[row.section]"
                    class="mt-0.5 text-[10px] leading-tight text-muted-foreground/80"
                  >
                    {{ SECTION_HINTS[row.section] }}
                  </div>
                </div>
              </template>
              <div
                :data-testid="
                  row.kind === 'thread'
                    ? `launcher-thread-${row.id}`
                    : row.kind === 'command'
                      ? `launcher-command-${row.id}`
                      : row.kind === 'project'
                        ? `launcher-project-${row.projectId}`
                        : row.kind === 'worktree'
                          ? `launcher-worktree-${row.worktreeId}`
                          : `launcher-file-${row.relativePath}`
                "
                role="option"
                :aria-selected="i === selectedIndex"
                class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                :class="
                  i === selectedIndex
                    ? 'bg-muted/70 text-foreground'
                    : 'hover:bg-muted/70'
                "
                @click="activateRow(row)"
                @mouseenter="selectedIndex = i"
              >
                <template v-if="row.kind === 'thread'">
                  <span class="shrink-0">
                    <AgentIcon :agent="row.agent" :size="16" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium">{{ row.title }}</div>
                    <div class="truncate text-xs text-muted-foreground">
                      {{ THREAD_AGENT_LABELS[row.agent] ?? row.agent }}
                    </div>
                  </div>
                </template>
                <template v-else-if="row.kind === 'command'">
                  <PanelLeft class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium">{{ row.label }}</div>
                    <div v-if="row.shortcutHint" class="truncate font-mono text-xs text-muted-foreground">
                      {{ row.shortcutHint }}
                    </div>
                  </div>
                </template>
                <template v-else-if="row.kind === 'project'">
                  <Folder class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium">{{ row.name }}</div>
                    <div class="truncate font-mono text-xs text-muted-foreground">{{ row.repoPath }}</div>
                  </div>
                </template>
                <template v-else-if="row.kind === 'worktree'">
                  <GitBranch class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium">{{ row.branch }}</div>
                    <div class="truncate text-xs text-muted-foreground">{{ row.name }}</div>
                  </div>
                </template>
                <template v-else>
                  <span class="shrink-0 text-muted-foreground" aria-hidden="true">📄</span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-mono text-xs">{{ row.relativePath }}</div>
                    <div v-if="row.worktreeLabel" class="truncate text-xs text-muted-foreground">
                      {{ row.worktreeLabel }}
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </template>
          <div
            v-else
            class="py-8 text-center text-sm text-muted-foreground"
            data-testid="workspace-launcher-empty"
          >
            {{ emptyHint }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
