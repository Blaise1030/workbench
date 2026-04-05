<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Search } from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import BaseButton from "@/components/ui/BaseButton.vue";
import FileTreeNode, { type FileTreeNodeData } from "@/components/FileTreeNode.vue";

const props = defineProps<{
  worktreePath: string | null;
}>();

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const allFiles = ref<FileSummary[]>([]);
const expandedFolders = ref<Set<string>>(new Set());
const selectedPath = ref<string | null>(null);
const loadedContent = ref("");
const draftContent = ref("");
const isSearching = ref(false);
const isLoadingFile = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);

const hasWorkspace = computed(() => Boolean(props.worktreePath));
const dirty = computed(
  () => selectedPath.value !== null && draftContent.value !== loadedContent.value
);
const hasActiveSearch = computed(() => query.value.trim().length > 0);

function compareTreeNodes(a: FileTreeNodeData, b: FileTreeNodeData): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function buildFileTree(files: FileSummary[]): FileTreeNodeData[] {
  const roots: FileTreeNodeData[] = [];
  const folderMap = new Map<string, Extract<FileTreeNodeData, { kind: "folder" }>>();

  for (const file of files) {
    const segments = file.relativePath.split("/").filter(Boolean);
    let currentChildren = roots;
    let currentPath = "";

    for (const [index, segment] of segments.entries()) {
      const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        currentChildren.push({
          kind: "file",
          name: segment,
          path: nextPath
        });
        continue;
      }

      let folder = folderMap.get(nextPath);
      if (!folder) {
        folder = {
          kind: "folder",
          name: segment,
          path: nextPath,
          children: []
        };
        folderMap.set(nextPath, folder);
        currentChildren.push(folder);
      }

      currentChildren = folder.children;
      currentPath = nextPath;
    }
  }

  function sortNodes(nodes: FileTreeNodeData[]): FileTreeNodeData[] {
    nodes.sort(compareTreeNodes);
    for (const node of nodes) {
      if (node.kind === "folder") {
        sortNodes(node.children);
      }
    }
    return nodes;
  }

  return sortNodes(roots);
}

function filterTreeNodes(nodes: FileTreeNodeData[], queryText: string): FileTreeNodeData[] {
  const trimmedQuery = queryText.trim().toLowerCase();
  if (!trimmedQuery) return nodes;

  const filtered: FileTreeNodeData[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path.toLowerCase().includes(trimmedQuery)) {
        filtered.push(node);
      }
      continue;
    }

    const children = filterTreeNodes(node.children, trimmedQuery);
    if (children.length > 0 || node.path.toLowerCase().includes(trimmedQuery)) {
      filtered.push({
        ...node,
        children
      });
    }
  }

  return filtered;
}

function defaultExpandedFolders(files: FileSummary[]): Set<string> {
  const next = new Set<string>();
  for (const file of files) {
    const firstSegment = file.relativePath.split("/").filter(Boolean)[0];
    if (firstSegment) next.add(firstSegment);
  }
  return next;
}

const fileTree = computed(() => buildFileTree(allFiles.value));
const visibleTree = computed(() => filterTreeNodes(fileTree.value, query.value));

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

function clearSelection(): void {
  selectedPath.value = null;
  loadedContent.value = "";
  draftContent.value = "";
}

function resetState(): void {
  query.value = "";
  allFiles.value = [];
  expandedFolders.value = new Set();
  error.value = null;
  isSearching.value = false;
  isLoadingFile.value = false;
  isSaving.value = false;
  clearSelection();
}

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!dirty.value) return true;
  return window.confirm("Discard unsaved changes?");
}

async function loadFileSummaries(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) {
    allFiles.value = [];
    isSearching.value = false;
    return;
  }

  isSearching.value = true;
  error.value = null;

  try {
    const files = await api.listFiles(cwd);
    allFiles.value = files;
    expandedFolders.value = defaultExpandedFolders(files);
  } catch (searchError) {
    allFiles.value = [];
    expandedFolders.value = new Set();
    error.value =
      searchError instanceof Error ? searchError.message : "Could not load files.";
  } finally {
    isSearching.value = false;
  }
}

async function openFile(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  isLoadingFile.value = true;
  error.value = null;

  try {
    const content = await api.readFile(cwd, relativePath);
    selectedPath.value = relativePath;
    loadedContent.value = content;
    draftContent.value = content;
  } catch (readError) {
    error.value =
      readError instanceof Error ? readError.message : "Could not open the selected file.";
  } finally {
    isLoadingFile.value = false;
  }
}

async function handleSelectFile(relativePath: string): Promise<void> {
  if (selectedPath.value === relativePath) return;
  if (!(await confirmDiscardIfDirty())) return;
  await openFile(relativePath);
}

async function handleSave(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  const relativePath = selectedPath.value;
  if (!api || !cwd || !relativePath) return;

  isSaving.value = true;
  error.value = null;

  try {
    await api.writeFile(cwd, relativePath, draftContent.value);
    loadedContent.value = draftContent.value;
  } catch (writeError) {
    error.value =
      writeError instanceof Error ? writeError.message : "Could not save the selected file.";
  } finally {
    isSaving.value = false;
  }
}

function handleRevert(): void {
  draftContent.value = loadedContent.value;
  error.value = null;
}

function handleToggleFolder(path: string): void {
  const next = new Set(expandedFolders.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  expandedFolders.value = next;
}

watch(query, () => {
  error.value = null;
});

watch(
  () => props.worktreePath,
  async (next, previous) => {
    if (next === previous) return;

    if (previous !== undefined && !(await confirmDiscardIfDirty())) {
      return;
    }

    resetState();
    await loadFileSummaries();
    void focusSearchInput();
  },
  { immediate: true }
);

onMounted(() => {
  void focusSearchInput();
});
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-foreground">
    <div class="flex w-80 shrink-0 flex-col border-r border-border">
      <div
        data-testid="file-search-header"
        class="border-b border-border bg-muted/40 p-1"
      >
        <div class="relative text-muted-foreground">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          />
          <input
            id="file-search"
            ref="searchInput"
            v-model="query"
            data-testid="file-search-input"
            type="text"
            placeholder="Search paths..."
            class="h-8 w-full min-w-0 rounded-lg border border-input bg-background py-1 pr-2.5 pl-10 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
            :disabled="!hasWorkspace"
          />
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <p v-if="!hasWorkspace" class="px-2 py-3 text-sm text-muted-foreground">
          Open a workspace to search and edit files.
        </p>
        <p v-else-if="isSearching" class="px-2 py-3 text-sm text-muted-foreground">
          Loading files…
        </p>
        <p v-else-if="error" class="px-2 py-3 text-sm text-destructive">
          {{ error }}
        </p>
        <p
          v-else-if="visibleTree.length === 0"
          class="px-2 py-3 text-sm text-muted-foreground"
        >
          No matching files.
        </p>
        <ul v-else class="space-y-1">
          <FileTreeNode
            v-for="node in visibleTree"
            :key="node.path"
            :node="node"
            :selected-path="selectedPath"
            :expanded-folders="expandedFolders"
            :force-expanded="hasActiveSearch"
            @toggle-folder="handleToggleFolder"
            @select-file="handleSelectFile"
          />
        </ul>
      </div>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        data-testid="file-editor-header"
        class="flex items-center justify-between gap-3 border-b border-border px-4 py-2"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ selectedPath ?? "No file selected" }}
          </p>
          <p
            v-if="dirty"
            class="text-xs text-amber-600"
          >
            Unsaved changes
          </p>
        </div>
        <div class="flex items-center gap-2">
          <BaseButton
            data-testid="revert-file"
            variant="outline"
            size="xs"
            :disabled="!selectedPath || !dirty"
            @click="handleRevert"
          >
            Revert
          </BaseButton>
          <BaseButton
            data-testid="save-file"
            variant="default"
            size="xs"
            :disabled="!selectedPath || !dirty || isSaving"
            @click="handleSave"
          >
            Save
          </BaseButton>
        </div>
      </header>

      <div class="min-h-0 flex-1 p-4">
        <p
          v-if="error && selectedPath"
          class="mb-3 text-sm text-destructive"
        >
          {{ error }}
        </p>
        <p
          v-if="!selectedPath"
          class="text-sm text-muted-foreground"
        >
          Pick a file from the search results to view or edit it.
        </p>
        <p
          v-else-if="isLoadingFile"
          class="text-sm text-muted-foreground"
        >
          Loading file…
        </p>
        <textarea
          v-else
          data-testid="file-editor"
          v-model="draftContent"
          spellcheck="false"
          class="h-full min-h-[18rem] w-full resize-none rounded-lg border border-border bg-background px-3 py-3 font-mono text-sm leading-6 outline-none focus-visible:border-ring"
        />
      </div>
    </div>
  </section>
</template>
