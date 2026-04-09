<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  FilePlus,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Trash2,
  X
} from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import Button from "@/components/ui/Button.vue";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import FileTreeNode, { type FileTreeNodeData } from "@/components/FileTreeNode.vue";
import CodeMirrorEditor from "@/components/CodeMirrorEditor.vue";
import Input from "@/components/ui/Input.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { renderMarkdownToHtml } from "@/lib/markdown";

const props = defineProps<{
  worktreePath: string | null;
}>();

function basenameFromPath(absPath: string): string {
  const parts = absPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? absPath;
}

/** Small emoji hint for file kind (shown in the file tab badge). */
function fileEmojiForPath(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const map: Record<string, string> = {
    ts: "📘",
    tsx: "⚛️",
    vue: "💚",
    js: "📜",
    jsx: "⚛️",
    md: "📝",
    markdown: "📝",
    json: "📋",
    css: "🎨",
    scss: "🎨",
    sass: "🎨",
    less: "🎨",
    html: "🌐",
    htm: "🌐",
    py: "🐍",
    rs: "🦀",
    go: "🐹",
    java: "☕",
    kt: "🟣",
    swift: "🐦",
    rb: "💎",
    php: "🐘",
    sh: "⌨️",
    bash: "⌨️",
    zsh: "⌨️",
    yml: "⚙️",
    yaml: "⚙️",
    toml: "⚙️",
    sql: "🗃️"
  };
  return map[ext] ?? "📄";
}

const searchInput = ref<InstanceType<typeof Input> | null>(null);
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

const SIDEBAR_COLLAPSED_KEY = "instrument.fileSearchSidebarCollapsed";

const sidebarCollapsed = ref(
  (() => {
    try {
      return (
        typeof localStorage !== "undefined" &&
        localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
      );
    } catch {
      return false;
    }
  })()
);

watch(sidebarCollapsed, (collapsed) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let fileSummariesSeq = 0;
let openFileSeq = 0;

const newFileDialogOpen = ref(false);
const newFilePathDraft = ref("");
const newFilePathInputRef = ref<InstanceType<typeof Input> | null>(null);
const newFileDialogFieldError = ref<string | null>(null);

const newFolderDialogOpen = ref(false);
const newFolderPathDraft = ref("");
const newFolderPathInputRef = ref<InstanceType<typeof Input> | null>(null);
const newFolderDialogFieldError = ref<string | null>(null);

type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  resolve: (confirmed: boolean) => void;
};

const confirmAction = ref<ConfirmActionState | null>(null);

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

/** Extension → CodeMirror language id (see `codemirrorLanguageExtensions.ts`). */
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
        if (file.kind === "directory") {
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
        } else {
          currentChildren.push({
            kind: "file",
            name: segment,
            path: nextPath
          });
        }
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

function computeNewFileDefaultValue(folderPathPrefix?: string): string {
  if (folderPathPrefix !== undefined) {
    const p = normalizeNewFilePathInput(folderPathPrefix);
    return p ? `${p.replace(/\/+$/, "")}/` : "src/";
  }
  const folderHint = selectedPath.value?.includes("/")
    ? selectedPath.value.replace(/\/[^/]+$/, "")
    : selectedPath.value
      ? ""
      : "src";
  return folderHint === "" ? "new-file.txt" : folderHint ? `${folderHint}/` : "src/";
}

function closeNewFileDialog(): void {
  newFileDialogOpen.value = false;
  newFileDialogFieldError.value = null;
}

function closeNewFolderDialog(): void {
  newFolderDialogOpen.value = false;
  newFolderDialogFieldError.value = null;
}

function computeNewFolderDefaultValue(folderPathPrefix?: string): string {
  if (folderPathPrefix !== undefined) {
    const p = normalizeNewFilePathInput(folderPathPrefix);
    return p ? `${p.replace(/\/+$/, "")}/new-folder` : "new-folder";
  }
  const folderHint = selectedPath.value?.includes("/")
    ? selectedPath.value.replace(/\/[^/]+$/, "")
    : selectedPath.value
      ? ""
      : "src";
  return folderHint === "" ? "new-folder" : `${folderHint}/new-folder`;
}

async function openNewFileDialog(folderPathPrefix?: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  newFilePathDraft.value = computeNewFileDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined
  );
  newFileDialogFieldError.value = null;
  newFileDialogOpen.value = true;
  await nextTick();
  const el = newFilePathInputRef.value;
  el?.focus();
  el?.select();
}

async function openNewFolderDialog(folderPathPrefix?: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api?.createFolder || !cwd) return;

  newFolderPathDraft.value = computeNewFolderDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined
  );
  newFolderDialogFieldError.value = null;
  newFolderDialogOpen.value = true;
  await nextTick();
  const el = newFolderPathInputRef.value;
  el?.focus();
  el?.select();
}

async function submitNewFile(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  const normalized = normalizeNewFilePathInput(newFilePathDraft.value);
  if (!normalized || normalized.endsWith("/")) {
    newFileDialogFieldError.value = "Enter a file path (not a folder).";
    return;
  }

  newFileDialogFieldError.value = null;
  error.value = null;

  try {
    await api.createFile(cwd, normalized);
    closeNewFileDialog();
    await loadFileSummaries();
    expandAncestorFolders(normalized);
    if (!(await confirmDiscardIfDirty())) return;
    await openFile(normalized);
  } catch (createError) {
    error.value =
      createError instanceof Error ? createError.message : "Could not create the file.";
  }
}

async function submitNewFolder(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api?.createFolder || !cwd) return;

  const normalized = normalizeNewFilePathInput(newFolderPathDraft.value).replace(/\/+$/, "");
  if (!normalized) {
    newFolderDialogFieldError.value = "Enter a folder path.";
    return;
  }

  newFolderDialogFieldError.value = null;
  error.value = null;

  try {
    await api.createFolder(cwd, normalized);
    closeNewFolderDialog();
    await loadFileSummaries();
    expandAncestorFolders(normalized);
  } catch (createError) {
    error.value =
      createError instanceof Error ? createError.message : "Could not create the folder.";
  }
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

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (confirmAction.value) {
      settleConfirmation(false);
      return;
    }
    if (newFileDialogOpen.value) {
      closeNewFileDialog();
      return;
    }
    if (newFolderDialogOpen.value) {
      closeNewFolderDialog();
      return;
    }
  }
}

function clearSelection(): void {
  selectedPath.value = null;
  loadedContent.value = "";
  draftContent.value = "";
}

async function handleCloseFileTab(): Promise<void> {
  if (!selectedPath.value) return;
  if (!(await confirmDiscardIfDirty())) return;
  clearSelection();
}

function invalidatePendingFileRequests(): void {
  fileSummariesSeq += 1;
  openFileSeq += 1;
  isSearching.value = false;
  isLoadingFile.value = false;
}

function resetState(): void {
  query.value = "";
  allFiles.value = [];
  expandedFolders.value = new Set();
  error.value = null;
  isSearching.value = false;
  isLoadingFile.value = false;
  isSaving.value = false;
  closeNewFileDialog();
  closeNewFolderDialog();
  clearSelection();
}

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
}

/** Ensures the search field exists (expands sidebar if needed) then focuses it. */
async function focusSearchAfterReveal(): Promise<void> {
  if (sidebarCollapsed.value) {
    sidebarCollapsed.value = false;
    await nextTick();
  }
  await focusSearchInput();
}

function collapseSidebar(): void {
  sidebarCollapsed.value = true;
}

async function expandSidebar(): Promise<void> {
  sidebarCollapsed.value = false;
  await focusSearchInput();
}

function requestConfirmation(options: Omit<ConfirmActionState, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    confirmAction.value = { ...options, resolve };
  });
}

function settleConfirmation(confirmed: boolean): void {
  const pending = confirmAction.value;
  if (!pending) return;
  confirmAction.value = null;
  pending.resolve(confirmed);
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!dirty.value) return true;
  return requestConfirmation({
    title: "Discard unsaved changes?",
    description: "Your current edits will be lost if you continue.",
    confirmLabel: "Discard changes",
    variant: "destructive"
  });
}

async function loadFileSummaries(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) {
    allFiles.value = [];
    isSearching.value = false;
    return;
  }

  const seq = ++fileSummariesSeq;
  isSearching.value = true;
  error.value = null;

  try {
    const files = await api.listFiles(cwd);
    if (seq !== fileSummariesSeq || props.worktreePath !== cwd) return;
    allFiles.value = files;
    expandedFolders.value = defaultExpandedFolders(files);
  } catch (searchError) {
    if (seq !== fileSummariesSeq || props.worktreePath !== cwd) return;
    allFiles.value = [];
    expandedFolders.value = new Set();
    error.value =
      searchError instanceof Error ? searchError.message : "Could not load files.";
  } finally {
    if (seq === fileSummariesSeq) {
      isSearching.value = false;
    }
  }
}

async function openFile(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  const seq = ++openFileSeq;
  isLoadingFile.value = true;
  error.value = null;

  try {
    const content = await api.readFile(cwd, relativePath);
    if (seq !== openFileSeq || props.worktreePath !== cwd) return;
    selectedPath.value = relativePath;
    loadedContent.value = content;
    draftContent.value = content;
  } catch (readError) {
    if (seq !== openFileSeq || props.worktreePath !== cwd) return;
    error.value =
      readError instanceof Error ? readError.message : "Could not open the selected file.";
  } finally {
    if (seq === openFileSeq) {
      isLoadingFile.value = false;
    }
  }
}

async function handleSelectFile(relativePath: string): Promise<void> {
  if (selectedPath.value === relativePath) return;
  if (!(await confirmDiscardIfDirty())) return;
  await openFile(relativePath);
}

async function handleAddFile(folderPathPrefix?: string): Promise<void> {
  const folderPrefix =
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined;
  await openNewFileDialog(folderPrefix);
}

async function handleAddFolder(folderPathPrefix?: string): Promise<void> {
  const folderPrefix =
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined;
  await openNewFolderDialog(folderPrefix);
}

function pathIsUnderOrEqualFolder(parentRel: string, childRel: string): boolean {
  const p = parentRel.replace(/\/+$/, "");
  const c = childRel.replace(/\/+$/, "");
  return c === p || c.startsWith(`${p}/`);
}

async function deleteFolderAtPath(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api?.deleteFolder || !cwd) return;

  const sel = selectedPath.value;
  const loseEdits = sel && pathIsUnderOrEqualFolder(relativePath, sel) && dirty.value;
  if (
    !(await requestConfirmation({
      title: `Delete folder ${relativePath} and its contents?`,
      description: loseEdits
        ? "Unsaved changes to the open file inside this folder will be lost."
        : "This permanently removes the folder and everything inside it.",
      confirmLabel: "Delete folder",
      variant: "destructive"
    }))
  ) {
    return;
  }

  error.value = null;

  try {
    await api.deleteFolder(cwd, relativePath);
    if (sel && pathIsUnderOrEqualFolder(relativePath, sel)) {
      clearSelection();
    }
    await loadFileSummaries();
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error ? deleteError.message : "Could not delete the folder.";
  }
}

async function deleteFileAtPath(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  const isSelected = selectedPath.value === relativePath;
  const loseEdits = isSelected && dirty.value;
  if (
    !(await requestConfirmation({
      title: `Delete ${relativePath}?`,
      description: loseEdits
        ? "Unsaved changes in this file will be lost."
        : "This permanently removes the file from the worktree.",
      confirmLabel: "Delete file",
      variant: "destructive"
    }))
  ) {
    return;
  }

  error.value = null;

  try {
    await api.deleteFile(cwd, relativePath);
    if (isSelected) clearSelection();
    await loadFileSummaries();
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error ? deleteError.message : "Could not delete the file.";
  }
}

async function handleDeleteFile(): Promise<void> {
  const relativePath = selectedPath.value;
  if (!relativePath) return;
  await deleteFileAtPath(relativePath);
}

async function onCtxAddFile(folderPath?: string): Promise<void> {
  await handleAddFile(folderPath);
}

async function onCtxAddFolder(folderPath?: string): Promise<void> {
  await handleAddFolder(folderPath);
}

async function onCtxDeleteFolder(folderPath: string): Promise<void> {
  await deleteFolderAtPath(folderPath);
}

async function onCtxDeleteFile(filePath: string): Promise<void> {
  await deleteFileAtPath(filePath);
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

async function confirmContextSwitch(nextWorktreePath: string | null): Promise<boolean> {
  if (nextWorktreePath === props.worktreePath) return true;
  return confirmDiscardIfDirty();
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
    invalidatePendingFileRequests();
    resetState();
    await loadFileSummaries();
    void focusSearchInput();
  },
  { immediate: true }
);

onMounted(() => {
  void focusSearchInput();
  const api = getApi();
  if (api?.onWorkspaceChanged) {
    disposeWorkspaceChanged = api.onWorkspaceChanged(() => {
      void loadFileSummaries();
    });
  }
  if (api?.onWorkingTreeFilesChanged) {
    disposeWorkingTreeFilesChanged = api.onWorkingTreeFilesChanged(() => {
      void loadFileSummaries();
    });
  }
  document.addEventListener("keydown", onGlobalKeydown);
});

onUnmounted(() => {
  disposeWorkspaceChanged?.();
  disposeWorkspaceChanged = null;
  disposeWorkingTreeFilesChanged?.();
  disposeWorkingTreeFilesChanged = null;
  document.removeEventListener("keydown", onGlobalKeydown);
});

defineExpose({
  focusSearch: (): void => {
    void focusSearchAfterReveal();
  },
  /** Same as the sidebar refresh control: reload the file list from disk. */
  refreshFileExplorer: (): void => {
    void loadFileSummaries();
  },
  /** Ask before leaving the current worktree context when there are unsaved edits. */
  confirmContextSwitch,
  /** Open a worktree-relative path in the editor (same as picking the file in the tree). */
  openWorkspaceFile: handleSelectFile
});
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-foreground">
    <div
      id="file-search-sidebar"
      class="flex shrink-0 flex-col overflow-hidden border-r border-border transition-[width] duration-200 ease-out"
      :class="sidebarCollapsed ? 'w-11' : 'w-72'"
    >
      <div
        v-if="sidebarCollapsed"
        class="flex flex-col items-center gap-1 border-b border-border p-1"
      >
        <Button
          data-testid="file-search-sidebar-expand"
          variant="outline"
          size="icon-xs"
          class="size-8 shrink-0 p-0"
          title="Show file explorer"
          aria-label="Show file explorer"
          :aria-expanded="false"
          aria-controls="file-search-sidebar"
          @click="expandSidebar()"
        >
          <PanelLeftOpen class="h-3.5 w-3.5" aria-hidden="true" />
          <span class="sr-only">Show file explorer</span>
        </Button>
      </div>
      <template v-else>
        <div
          data-testid="file-search-header"
          class="flex items-center gap-1 border-b border-border p-1"
        >          
          <div class="relative min-w-0 flex-1 text-muted-foreground">
            <Search
              class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
            />
            <Input
              id="file-search"
              ref="searchInput"
              v-model="query"
              data-testid="file-search-input"
              type="text"
              placeholder="Search paths..."
              class="h-7 min-w-0 w-full rounded-md bg-background py-0.5 pr-2 pl-8 text-xs focus-visible:ring-2"
              :disabled="!hasWorkspace"
            />
          </div>
          <Button
            data-testid="refresh-file-explorer"
            variant="outline"
            size="icon-xs"
            class="shrink-0 px-1.5"
            :disabled="!hasWorkspace || isSearching"
            :title="'Refresh file explorer'"
            @click="loadFileSummaries"
          >
            <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Refresh file explorer</span>
          </Button>
          <Button
            data-testid="add-file"
            variant="outline"
            size="icon-xs"
            class="shrink-0 px-1.5"
            :disabled="!hasWorkspace"
            :title="'Add file'"
            @click="handleAddFile()"
          >
            <FilePlus class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Add file</span>
          </Button>
          <Button
            data-testid="add-folder"
            variant="outline"
            size="icon-xs"
            class="shrink-0 px-1.5"
            :disabled="!hasWorkspace"
            :title="'Add folder'"
            @click="handleAddFolder()"
          >
            <FolderPlus class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Add folder</span>
          </Button>
          <Button
            data-testid="file-search-sidebar-collapse"
            variant="outline"
            size="icon-xs"
            class="shrink-0 px-1.5"
            :title="'Hide file explorer'"
            @click="collapseSidebar()"
          >
            <PanelLeftClose class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Hide file explorer</span>
          </Button>
        </div>

        <ContextMenu>
          <ContextMenuTrigger as-child>
            <div
              data-testid="file-tree-scroll"
              class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5"
            >
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
                  @add-file="onCtxAddFile"
                  @add-folder="onCtxAddFolder"
                  @delete-folder="onCtxDeleteFolder"
                  @delete-file="onCtxDeleteFile"
                />
              </ul>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent data-testid="file-tree-context-menu" class="min-w-[11rem]">
            <ContextMenuItem data-testid="ctx-add-file" class="text-xs" @select="onCtxAddFile()">
              Add file…
            </ContextMenuItem>
            <ContextMenuItem data-testid="ctx-add-folder" class="text-xs" @select="onCtxAddFolder()">
              Add folder…
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </template>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        data-testid="file-editor-header"
        class="flex items-center justify-between gap-3 border-b border-border px-4 py-1.5"
      >
        <div
          class="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
        >
          <template v-if="selectedPath">
            <span
              class="sr-only"
              data-testid="file-editor-active-path"
            >{{ selectedPath }}</span>
            <div
              :class="
                cn(
                  badgeVariants({ variant: 'secondary' }),
                  'inline-flex h-7 min-w-0 max-w-[16rem] shrink-0 items-stretch gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pr-0.5 pl-1.5 shadow-none'
                )
              "
              :title="selectedPath"
            >
              <span class="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  class="shrink-0 text-[13px] leading-none"
                  aria-hidden="true"
                >{{ fileEmojiForPath(selectedPath) }}</span>
                <span class="min-w-0 truncate text-xs font-medium">{{
                  basenameFromPath(selectedPath)
                }}</span>
                <span
                  v-if="dirty"
                  class="sr-only"
                >Unsaved changes</span>
                <span
                  v-if="dirty"
                  class="shrink-0 rounded-full size-1.5 bg-amber-600"
                  aria-hidden="true"
                  title="Unsaved changes"
                />
              </span>
              <Button
                data-testid="file-editor-tab-close"
                type="button"
                variant="ghost"
                size="icon-xs"
                class="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-foreground"
                :aria-label="`Close ${basenameFromPath(selectedPath)}`"
                @click="handleCloseFileTab"
              >
                <X class="size-3" aria-hidden="true" />
                <span class="sr-only">Close file tab</span>
              </Button>
            </div>
          </template>
          <p
            v-else
            class="shrink-0 text-xs text-muted-foreground"
          >
            No file
          </p>
        </div>
        <div
          role="toolbar"
          aria-label="File actions"
          class="flex items-center gap-1"
        >
          <Button
            data-testid="revert-file"
            variant="outline"
            size="xs"
            :disabled="!selectedPath || !dirty"
            @click="handleRevert"
          >
            Revert
          </Button>
          <Button
            data-testid="save-file"
            variant="default"
            size="xs"
            :disabled="!selectedPath || !dirty || isSaving"
            @click="handleSave"
          >
            Save
          </Button>
          <Button
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
          </Button>
        </div>
      </header>

      <div
        data-testid="file-editor-body"
        class="relative flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          v-if="isMarkdownFile && selectedPath"
          class="absolute top-2 right-3 z-20 rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
        >
          <PillTabs
            v-model="mdViewMode"
            class="min-w-0 shrink-0 [&_[role=tablist]]:px-0 [&_[role=tablist]]:py-0"
            aria-label="Markdown view"
            :tabs="mdViewTabs"
          />
        </div>
        <p
          v-if="error && selectedPath"
          class="mb-2 px-4 pt-2 text-xs text-destructive"
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
          class="px-4 pt-2 text-xs text-muted-foreground"
        >
          Loading file…
        </p>
        <div
          v-else-if="isMarkdownFile && mdViewMode === 'read'"
          data-testid="markdown-preview"
          class="markdown-reader h-full min-h-[18rem] overflow-y-auto rounded-md bg-muted/10 px-3 py-3"
          v-html="markdownHtml"
        />
        <CodeMirrorEditor
          v-else
          v-model="draftContent"
          :language="editorLanguage"
          :aria-label="
            selectedPath
              ? `Source code, ${editorLanguage ?? 'plain text'}, ${selectedPath}`
              : undefined
          "
        />
      </div>
    </div>

    <Dialog :open="newFileDialogOpen" @update:open="(open) => (!open ? closeNewFileDialog() : undefined)">
      <DialogContent data-testid="new-file-dialog" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle id="new-file-dialog-title" class="text-sm">New file</DialogTitle>
          <DialogDescription class="text-xs">
            Path relative to the workspace (use <span class="font-mono">/</span> for folders).
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-3" @submit.prevent="submitNewFile">
          <div>
            <label for="new-file-path-input" class="sr-only">File path</label>
            <Input
              id="new-file-path-input"
              ref="newFilePathInputRef"
              v-model="newFilePathDraft"
              data-testid="new-file-path-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="h-9 w-full rounded-md bg-background px-2.5 text-xs focus-visible:ring-2"
              placeholder="e.g. src/components/MyFile.ts"
            />
            <p
              v-if="newFileDialogFieldError"
              data-testid="new-file-dialog-error"
              class="mt-1.5 text-xs text-destructive"
            >
              {{ newFileDialogFieldError }}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              data-testid="new-file-cancel"
              variant="outline"
              size="xs"
              @click="closeNewFileDialog"
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="new-file-confirm" variant="default" size="xs">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="newFolderDialogOpen" @update:open="(open) => (!open ? closeNewFolderDialog() : undefined)">
      <DialogContent data-testid="new-folder-dialog" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle id="new-folder-dialog-title" class="text-sm">New folder</DialogTitle>
          <DialogDescription class="text-xs">
            Path relative to the workspace (nested folders are created as needed).
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-3" @submit.prevent="submitNewFolder">
          <div>
            <label for="new-folder-path-input" class="sr-only">Folder path</label>
            <Input
              id="new-folder-path-input"
              ref="newFolderPathInputRef"
              v-model="newFolderPathDraft"
              data-testid="new-folder-path-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="h-9 w-full rounded-md bg-background px-2.5 text-xs focus-visible:ring-2"
              placeholder="e.g. src/components/MyFolder"
            />
            <p
              v-if="newFolderDialogFieldError"
              data-testid="new-folder-dialog-error"
              class="mt-1.5 text-xs text-destructive"
            >
              {{ newFolderDialogFieldError }}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              data-testid="new-folder-cancel"
              variant="outline"
              size="xs"
              @click="closeNewFolderDialog"
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="new-folder-confirm" variant="default" size="xs">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="confirmAction !== null">
      <AlertDialogContent data-testid="confirm-action-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ confirmAction?.title }}</AlertDialogTitle>
          <AlertDialogDescription>{{ confirmAction?.description }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="confirm-action-cancel"
            class="inline-flex h-6 items-center justify-center rounded-[min(var(--radius-md),10px)] border px-2 text-xs font-medium"
            @click="settleConfirmation(false)"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-action-confirm"
            class="inline-flex h-6 items-center justify-center rounded-[min(var(--radius-md),10px)] px-2 text-xs font-medium"
            :class="
              confirmAction?.variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'
            "
            @click="settleConfirmation(true)"
          >
            {{ confirmAction?.confirmLabel ?? "Continue" }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
