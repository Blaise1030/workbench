<script setup lang="ts">
import { Search } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import {
  parseLauncherQuery,
  searchLauncherRows,
  type LauncherRow,
  type LauncherSectionId
} from "@/lib/workspaceLauncherSearch";
import { findDefinition, formatShortcut } from "@/keybindings/registry";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { FileSummary } from "@shared/ipc";
import type { ThreadAgent } from "@shared/domain";

const open = defineModel<boolean>({ default: false });

const emit = defineEmits<{
  pickThread: [threadId: string];
  pickFile: [payload: { relativePath: string; worktreeId: string | null }];
}>();

const workspace = useWorkspaceStore();

const query = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
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

const rows = computed<LauncherRow[]>(() =>
  searchLauncherRows(
    parsed.value,
    workspace.activeThreads,
    branchFiles.value,
    otherWorktreeFiles.value
  )
);

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
    return "Search threads and files in this worktree. Use @wt for other worktrees.";
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

watch(rows, (r) => {
  if (selectedIndex.value >= r.length) selectedIndex.value = Math.max(0, r.length - 1);
});

watch(query, () => {
  selectedIndex.value = 0;
});

function close(): void {
  open.value = false;
}

function activateRow(row: LauncherRow): void {
  if (row.kind === "thread") {
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
  agents: "Agents",
  files: "Files",
  workspace: "Workspace"
};

const SECTION_HINTS: Partial<Record<LauncherSectionId, string>> = {
  agents: "Threads in this worktree",
  files: "Paths in the active worktree",
  workspace: "Files in linked worktrees (@wt)"
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
        class="ui-glass-panel relative z-[301] flex w-full max-w-lg flex-col overflow-hidden rounded-lg text-popover-foreground"
        @click.stop
      >
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search threads and files…"
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

        <div class="max-h-[min(50vh,320px)] overflow-y-auto py-1" role="listbox" aria-label="Search results">
          <template v-if="rows.length > 0">
            <template v-for="(row, i) in rows" :key="row.kind === 'thread' ? `t-${row.id}` : `f-${row.worktreeId ?? 'main'}-${row.relativePath}`">
              <div
                v-if="showSectionHeaderAt(i)"
                class="border-t border-border first:border-t-0"
                role="presentation"
              >
                <div
                  class="px-3 pb-1"
                  :class="i === 0 ? 'pt-1' : 'pt-2'"
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
              </div>
              <div
                :data-testid="
                  row.kind === 'thread' ? `launcher-thread-${row.id}` : `launcher-file-${row.relativePath}`
                "
                role="option"
                :aria-selected="i === selectedIndex"
                class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
                :class="i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'"
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
            class="px-3 py-8 text-center text-sm text-muted-foreground"
            data-testid="workspace-launcher-empty"
          >
            {{ emptyHint }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
