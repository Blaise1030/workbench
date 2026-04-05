<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { FilePlus, Search, Trash2 } from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import BaseButton from "@/components/ui/BaseButton.vue";
import FileTreeNode, { type FileTreeNodeData } from "@/components/FileTreeNode.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import { renderMarkdownToHtml } from "@/lib/markdown";

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

const isMarkdownFile = computed(() => {
  const p = selectedPath.value?.toLowerCase() ?? "";
  return p.endsWith(".md") || p.endsWith(".markdown");
});

const mdViewMode = ref<"read" | "source">("read");

const mdViewTabs = computed<PillTabItem[]>(() => [
  { value: "read", label: "Read" },
  { value: "source", label: "Source" }
]);

const markdownHtml = computed(() => {
  if (!isMarkdownFile.value) return "";
  return renderMarkdownToHtml(draftContent.value);
});

/** Hint from extension for `data-language` / a11y (no syntax highlighter yet). */
const editorLanguage = computed(() => {
  const path = selectedPath.value;
  if (!path) return undefined;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "plain";
  const ext = path.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "javascript",
    vue: "vue",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    sql: "sql",
    toml: "toml"
  };
  return map[ext] ?? "plain";
});

function handleEditorKeydown(e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  const ta = e.target as HTMLTextAreaElement;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const indent = "  ";
  draftContent.value =
    draftContent.value.slice(0, start) + indent + draftContent.value.slice(end);
  void nextTick(() => {
    ta.selectionStart = ta.selectionEnd = start + indent.length;
  });
}

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

function normalizeNewFilePathInput(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function expandAncestorFolders(relativePath: string): void {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length <= 1) return;

  const next = new Set(expandedFolders.value);
  let acc = "";
  for (let i = 0; i < segments.length - 1; i++) {
    acc = acc ? `${acc}/${segments[i]}` : segments[i]!;
    next.add(acc);
  }
  expandedFolders.value = next;
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

async function handleAddFile(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  const folderHint = selectedPath.value?.includes("/")
    ? selectedPath.value.replace(/\/[^/]+$/, "")
    : selectedPath.value
      ? ""
      : "src";
  const defaultValue =
    folderHint === "" ? "new-file.txt" : folderHint ? `${folderHint}/` : "src/";

  const raw = window.prompt("New file path (relative to workspace)", defaultValue);
  if (raw === null) return;

  const normalized = normalizeNewFilePathInput(raw);
  if (!normalized || normalized.endsWith("/")) {
    error.value = "Enter a file path (not a folder).";
    return;
  }

  error.value = null;

  try {
    await api.createFile(cwd, normalized);
    await loadFileSummaries();
    expandAncestorFolders(normalized);
    if (!(await confirmDiscardIfDirty())) return;
    await openFile(normalized);
  } catch (createError) {
    error.value =
      createError instanceof Error ? createError.message : "Could not create the file.";
  }
}

async function handleDeleteFile(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  const relativePath = selectedPath.value;
  if (!api || !cwd || !relativePath) return;

  const message = dirty.value
    ? `Delete ${relativePath}? Unsaved changes will be lost.`
    : `Delete ${relativePath}?`;
  if (!window.confirm(message)) return;

  error.value = null;

  try {
    await api.deleteFile(cwd, relativePath);
    clearSelection();
    await loadFileSummaries();
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error ? deleteError.message : "Could not delete the file.";
  }
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

watch(selectedPath, (path) => {
  if (path && /\.(md|markdown)$/i.test(path)) {
    mdViewMode.value = "read";
  }
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
        class="flex items-center gap-1 border-b border-border p-1"
      >
        <div class="relative min-w-0 flex-1 text-muted-foreground">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
          />
          <input
            id="file-search"
            ref="searchInput"
            v-model="query"
            data-testid="file-search-input"
            type="text"
            placeholder="Search paths..."
            class="h-7 w-full bg-muted min-w-0 rounded-md border border-input bg-background py-0.5 pr-2 pl-8 text-xs text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
            :disabled="!hasWorkspace"
          />
        </div>
        <BaseButton
          data-testid="add-file"
          variant="outline"
          size="xs"
          class="shrink-0 px-1.5"
          :disabled="!hasWorkspace"
          :title="'Add file'"
          @click="handleAddFile"
        >
          <FilePlus class="h-3.5 w-3.5" aria-hidden="true" />
          <span class="sr-only">Add file</span>
        </BaseButton>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
        <p v-if="!hasWorkspace" class="px-1.5 py-2 text-xs text-muted-foreground">
          Open a workspace to search and edit files.
        </p>
        <p v-else-if="isSearching" class="px-1.5 py-2 text-xs text-muted-foreground">
          Loading files…
        </p>
        <p v-else-if="error" class="px-1.5 py-2 text-xs text-destructive">
          {{ error }}
        </p>
        <p
          v-else-if="visibleTree.length === 0"
          class="px-1.5 py-2 text-xs text-muted-foreground"
        >
          No matching files.
        </p>
        <ul v-else class="space-y-0.5 text-xs">
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
        class="flex items-center justify-between gap-3 border-b border-border px-4 py-1.5"
      >
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p class="min-w-0 truncate text-xs font-medium">
            {{ selectedPath ?? "No file selected" }}
          </p>
          <PillTabs
            v-if="isMarkdownFile && selectedPath"
            v-model="mdViewMode"
            class="min-w-0 shrink-0 [&_[role=tablist]]:px-0 [&_[role=tablist]]:py-0"
            aria-label="Markdown view"
            :tabs="mdViewTabs"
          />
          <template v-if="dirty">
            <span class="sr-only">Unsaved changes</span>
            <div
              class="shrink-0 rounded-full size-2 bg-amber-600"
              aria-hidden="true"
              title="Unsaved changes"
            />
          </template>
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
          <BaseButton
            data-testid="delete-file"
            variant="outline"
            size="xs"
            class="text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="!selectedPath"
            :title="'Delete file'"
            @click="handleDeleteFile"
          >
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Delete file</span>
          </BaseButton>
        </div>
      </header>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        <p
          v-if="error && selectedPath"
          class="mb-2 text-xs text-destructive"
        >
          {{ error }}
        </p>
        <div
          v-if="!selectedPath"
          data-testid="file-editor-empty-state"
          class="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-3 rounded-md bg-background px-4 py-8 text-center"
          role="status"
          aria-live="polite"
        >
          <span class="select-none text-4xl leading-none" aria-hidden="true">📄</span>
          <p class="max-w-xs text-xs text-muted-foreground">
            Pick a file from the search results to view or edit it.
          </p>
        </div>
        <p
          v-else-if="isLoadingFile"
          class="text-xs text-muted-foreground"
        >
          Loading file…
        </p>
        <div
          v-else-if="isMarkdownFile && mdViewMode === 'read'"
          data-testid="markdown-preview"
          class="markdown-reader h-full min-h-[18rem] overflow-y-auto rounded-md bg-muted/10 px-3 py-2"
          v-html="markdownHtml"
        />
        <textarea
          v-else
          data-testid="file-editor"
          v-model="draftContent"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          autocorrect="off"
          :data-language="editorLanguage"
          :aria-label="
            selectedPath
              ? `Source code, ${editorLanguage ?? 'plain text'}, ${selectedPath}`
              : undefined
          "
          class="file-editor-textarea h-full min-h-[18rem] w-full resize-none rounded-md border border-transparent bg-muted/15 px-2.5 py-2 font-mono text-xs leading-5 tracking-normal whitespace-pre overflow-x-auto outline-none focus-visible:border-ring [font-feature-settings:'liga'_0] [tab-size:2]"
          @keydown="handleEditorKeydown"
        />
      </div>
    </div>
  </section>
</template>
