<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  FilePlus,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Trash2
} from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import BaseButton from "@/components/ui/BaseButton.vue";
import FileTreeNode, {
  type FileTreeContextCoords,
  type FileTreeNodeData
} from "@/components/FileTreeNode.vue";
import CodeMirrorEditor from "@/components/CodeMirrorEditor.vue";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import { renderMarkdownToHtml } from "@/lib/markdown";

const props = withDefaults(
  defineProps<{
    worktreePath: string | null;
    /** Shown beside the file path in the editor header (active worktree name). */
    worktreeLabel?: string | null;
  }>(),
  { worktreeLabel: null }
);

function basenameFromPath(absPath: string): string {
  const parts = absPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? absPath;
}

const workspaceHeaderLine = computed(() => {
  if (!props.worktreePath) return null;
  const label = props.worktreeLabel?.trim();
  return label || basenameFromPath(props.worktreePath);
});

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

type TreeContextMenuState =
  | { x: number; y: number; variant: "pane" }
  | { x: number; y: number; variant: "folder"; folderPath: string }
  | { x: number; y: number; variant: "file"; filePath: string };

const treeContextMenu = ref<TreeContextMenuState | null>(null);
const ctxMenuRoot = ref<HTMLElement | null>(null);
let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;

const newFileDialogOpen = ref(false);
const newFilePathDraft = ref("");
const newFilePathInputRef = ref<HTMLInputElement | null>(null);
const newFileDialogFieldError = ref<string | null>(null);

const newFolderDialogOpen = ref(false);
const newFolderPathDraft = ref("");
const newFolderPathInputRef = ref<HTMLInputElement | null>(null);
const newFolderDialogFieldError = ref<string | null>(null);

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

const contextMenuStyle = computed(() => {
  const m = treeContextMenu.value;
  if (!m) return {};
  const pad = 8;
  const menuW = 200;
  const menuH = 140;
  let x = m.x;
  let y = m.y;
  if (typeof window !== "undefined") {
    x = Math.min(x, window.innerWidth - menuW - pad);
    y = Math.min(y, window.innerHeight - menuH - pad);
    x = Math.max(pad, x);
    y = Math.max(pad, y);
  }
  return { left: `${x}px`, top: `${y}px` };
});

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

function onNewFileBackdropPointerDown(event: MouseEvent): void {
  if (event.target === event.currentTarget) closeNewFileDialog();
}

function onNewFolderBackdropPointerDown(event: MouseEvent): void {
  if (event.target === event.currentTarget) closeNewFolderDialog();
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

function closeTreeContextMenu(): void {
  treeContextMenu.value = null;
}

function handleTreePaneContextMenu(e: MouseEvent): void {
  if (!hasWorkspace.value || isSearching.value) return;
  if ((e.target as HTMLElement).closest("button")) return;
  e.preventDefault();
  treeContextMenu.value = { x: e.clientX, y: e.clientY, variant: "pane" };
}

function handleContextMenuFolder(payload: FileTreeContextCoords): void {
  treeContextMenu.value = {
    x: payload.clientX,
    y: payload.clientY,
    variant: "folder",
    folderPath: payload.path
  };
}

function handleContextMenuFile(payload: FileTreeContextCoords): void {
  treeContextMenu.value = {
    x: payload.clientX,
    y: payload.clientY,
    variant: "file",
    filePath: payload.path
  };
}

function onGlobalPointerDown(e: PointerEvent): void {
  if (!treeContextMenu.value) return;
  const t = e.target as Node | null;
  if (t && ctxMenuRoot.value?.contains(t)) return;
  closeTreeContextMenu();
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (newFileDialogOpen.value) {
      closeNewFileDialog();
      return;
    }
    if (newFolderDialogOpen.value) {
      closeNewFolderDialog();
      return;
    }
    closeTreeContextMenu();
  }
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
  const message = loseEdits
    ? `Delete folder ${relativePath} and its contents? Unsaved changes to an open file inside will be lost.`
    : `Delete folder ${relativePath} and its contents?`;
  if (!window.confirm(message)) return;

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
  const message = loseEdits
    ? `Delete ${relativePath}? Unsaved changes will be lost.`
    : `Delete ${relativePath}?`;
  if (!window.confirm(message)) return;

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

async function onCtxAddFile(): Promise<void> {
  const m = treeContextMenu.value;
  closeTreeContextMenu();
  if (!m) return;
  if (m.variant === "folder") {
    await handleAddFile(m.folderPath);
  } else if (m.variant === "pane") {
    await handleAddFile();
  }
}

async function onCtxAddFolder(): Promise<void> {
  const m = treeContextMenu.value;
  closeTreeContextMenu();
  if (!m) return;
  if (m.variant === "folder") {
    await handleAddFolder(m.folderPath);
  } else if (m.variant === "pane") {
    await handleAddFolder();
  }
}

async function onCtxDeleteFolder(): Promise<void> {
  const m = treeContextMenu.value;
  closeTreeContextMenu();
  if (!m || m.variant !== "folder") return;
  await deleteFolderAtPath(m.folderPath);
}

async function onCtxDeleteFile(): Promise<void> {
  const m = treeContextMenu.value;
  closeTreeContextMenu();
  if (!m || m.variant !== "file") return;
  await deleteFileAtPath(m.filePath);
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
  document.addEventListener("pointerdown", onGlobalPointerDown, true);
  document.addEventListener("keydown", onGlobalKeydown);
});

onUnmounted(() => {
  disposeWorkspaceChanged?.();
  disposeWorkspaceChanged = null;
  disposeWorkingTreeFilesChanged?.();
  disposeWorkingTreeFilesChanged = null;
  document.removeEventListener("pointerdown", onGlobalPointerDown, true);
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
        <BaseButton
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
        </BaseButton>
      </div>
      <template v-else>
        <div
          data-testid="file-search-header"
          class="flex items-center gap-1 border-b border-border p-1"
        >
          <BaseButton
            data-testid="file-search-sidebar-collapse"
            variant="outline"
            size="icon-xs"
            class="shrink-0 px-1.5"
            title="Hide file explorer"
            aria-label="Hide file explorer"
            :aria-expanded="true"
            aria-controls="file-search-sidebar"
            @click="collapseSidebar()"
          >
            <PanelLeftClose class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Hide file explorer</span>
          </BaseButton>
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
          </BaseButton>
          <BaseButton
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
          </BaseButton>
          <BaseButton
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
          </BaseButton>
        </div>

        <div
          data-testid="file-tree-scroll"
          class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5"
          @contextmenu="handleTreePaneContextMenu"
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
              @context-menu-folder="handleContextMenuFolder"
              @context-menu-file="handleContextMenuFile"
            />
          </ul>
        </div>
      </template>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        data-testid="file-editor-header"
        class="flex items-center justify-between gap-3 border-b border-border px-4 py-1.5"
      >
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div
            v-if="workspaceHeaderLine"
            data-testid="file-editor-workspace-context"
            class="flex min-w-0 max-w-[min(14rem,32vw)] shrink-0 items-center gap-2 border-r border-border pr-3"
          >
            <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace
            </span>
            <span
              class="min-w-0 truncate font-mono text-[11px] text-foreground"
              :title="props.worktreePath ?? undefined"
            >{{ workspaceHeaderLine }}</span>
          </div>
          <p class="min-w-0 flex-1 truncate text-xs font-medium">
            {{ selectedPath ?? "No file selected" }}
          </p>
          <template v-if="dirty">
            <span class="sr-only">Unsaved changes</span>
            <div
              class="shrink-0 rounded-full size-2 bg-amber-600"
              aria-hidden="true"
              title="Unsaved changes"
            />
          </template>
        </div>
        <div
          role="toolbar"
          aria-label="File actions"
          class="flex items-center gap-1"
        >
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

    <Teleport to="body">
      <div
        v-if="treeContextMenu"
        ref="ctxMenuRoot"
        data-testid="file-tree-context-menu"
        class="fixed z-[200] min-w-[11rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        :style="contextMenuStyle"
        role="menu"
        @contextmenu.prevent
      >
        <template v-if="treeContextMenu.variant === 'folder' || treeContextMenu.variant === 'pane'">
          <button
            type="button"
            role="menuitem"
            data-testid="ctx-add-file"
            class="flex w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            @click="onCtxAddFile"
          >
            Add file…
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="ctx-add-folder"
            class="flex w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            @click="onCtxAddFolder"
          >
            Add folder…
          </button>
        </template>
        <template v-if="treeContextMenu.variant === 'folder'">
          <button
            type="button"
            role="menuitem"
            data-testid="ctx-delete-folder"
            class="flex w-full rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
            @click="onCtxDeleteFolder"
          >
            Delete folder
          </button>
        </template>
        <template v-if="treeContextMenu.variant === 'file'">
          <button
            type="button"
            role="menuitem"
            data-testid="ctx-delete-file"
            class="flex w-full rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
            @click="onCtxDeleteFile"
          >
            Delete file
          </button>
        </template>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="newFileDialogOpen"
        data-testid="new-file-dialog"
        class="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto p-4 pt-[15vh] ui-glass-scrim"
        role="presentation"
        @pointerdown="onNewFileBackdropPointerDown"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-file-dialog-title"
          class="ui-glass-panel relative w-full max-w-md rounded-lg p-4 text-card-foreground outline-none"
          tabindex="-1"
          @pointerdown.stop
        >
          <h2 id="new-file-dialog-title" class="text-sm font-semibold">New file</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Path relative to the workspace (use <span class="font-mono">/</span> for folders).
          </p>
          <form class="mt-4 space-y-3" @submit.prevent="submitNewFile">
            <div>
              <label for="new-file-path-input" class="sr-only">File path</label>
              <input
                id="new-file-path-input"
                ref="newFilePathInputRef"
                v-model="newFilePathDraft"
                data-testid="new-file-path-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                class="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
            <div class="flex justify-end gap-2">
              <BaseButton
                type="button"
                data-testid="new-file-cancel"
                variant="outline"
                size="xs"
                @click="closeNewFileDialog"
              >
                Cancel
              </BaseButton>
              <BaseButton type="submit" data-testid="new-file-confirm" variant="default" size="xs">
                Create
              </BaseButton>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="newFolderDialogOpen"
        data-testid="new-folder-dialog"
        class="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto p-4 pt-[15vh] ui-glass-scrim"
        role="presentation"
        @pointerdown="onNewFolderBackdropPointerDown"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-folder-dialog-title"
          class="ui-glass-panel relative w-full max-w-md rounded-lg p-4 text-card-foreground outline-none"
          tabindex="-1"
          @pointerdown.stop
        >
          <h2 id="new-folder-dialog-title" class="text-sm font-semibold">New folder</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            Path relative to the workspace (nested folders are created as needed).
          </p>
          <form class="mt-4 space-y-3" @submit.prevent="submitNewFolder">
            <div>
              <label for="new-folder-path-input" class="sr-only">Folder path</label>
              <input
                id="new-folder-path-input"
                ref="newFolderPathInputRef"
                v-model="newFolderPathDraft"
                data-testid="new-folder-path-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                class="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
            <div class="flex justify-end gap-2">
              <BaseButton
                type="button"
                data-testid="new-folder-cancel"
                variant="outline"
                size="xs"
                @click="closeNewFolderDialog"
              >
                Cancel
              </BaseButton>
              <BaseButton type="submit" data-testid="new-folder-confirm" variant="default" size="xs">
                Create
              </BaseButton>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </section>
</template>
