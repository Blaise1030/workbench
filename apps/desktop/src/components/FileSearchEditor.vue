<script setup lang="ts">
import { watchDebounced } from "@vueuse/core";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  FilePlus,
  FolderPlus,
  Maximize2,
  Minimize2,
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
    sql: "🗃️",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    webp: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    avif: "🖼️",
    bmp: "🖼️",
    ico: "🖼️"
  };
  return map[ext] ?? "📄";
}

/** Lowercase extension without dot (e.g. `docs/a.PNG` → `png`). */
function fileExtensionLower(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

/** Shown as image preview first; Source loads UTF-8 text (binary will look garbled). */
const IMAGE_PREVIEW_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif"
]);

/** Saving UTF-8 edits would corrupt these; block Save when dirty in Source mode. */
const RASTER_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "avif"
]);

const searchInput = ref<InstanceType<typeof Input> | null>(null);
const query = ref("");
/** Milliseconds after typing stops before path filter / text search runs. */
const SEARCH_INPUT_DEBOUNCE_MS = 280;
/** Debounced mirror of `query` for filtering and content IPC (input updates immediately). */
const debouncedQuery = ref("");
/** `path`: filter by path; `content`: full-text search (main process). */
const searchMode = ref<"path" | "content">("path");
const allFiles = ref<FileSummary[]>([]);
/** Relative paths whose file contents matched the last content search. */
const contentMatchPaths = ref<string[]>([]);
const contentSearchError = ref<string | null>(null);
const isContentSearching = ref(false);
let contentSearchSeq = 0;
const expandedFolders = ref<Set<string>>(new Set());
const selectedPath = ref<string | null>(null);
const loadedContent = ref("");
const draftContent = ref("");
const isSearching = ref(false);
const isLoadingFile = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);

const SIDEBAR_COLLAPSED_KEY = "instrument.fileSearchSidebarCollapsed";
const EDITOR_COLLAPSED_KEY = "instrument.fileSearchEditorCollapsed";
const LINE_NUMBERS_VISIBLE_KEY = "instrument.fileSearchLineNumbersVisible";
const MD_SOURCE_IMAGE_PREVIEWS_KEY = "instrument.markdownSourceImagePreviewsVisible";

function readLocalStorageFlag(key: string, fallback = false): boolean {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

const sidebarCollapsed = ref(readLocalStorageFlag(SIDEBAR_COLLAPSED_KEY));
const editorCollapsed = ref(readLocalStorageFlag(EDITOR_COLLAPSED_KEY));
const showLineNumbers = ref(readLocalStorageFlag(LINE_NUMBERS_VISIBLE_KEY, true));
const mdSourceImagePreviews = ref(readLocalStorageFlag(MD_SOURCE_IMAGE_PREVIEWS_KEY, true));

watch(sidebarCollapsed, (collapsed) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

watch(editorCollapsed, (collapsed) => {
  try {
    localStorage.setItem(EDITOR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

watch(showLineNumbers, (visible) => {
  try {
    localStorage.setItem(LINE_NUMBERS_VISIBLE_KEY, visible ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

watch(mdSourceImagePreviews, (on) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MD_SOURCE_IMAGE_PREVIEWS_KEY, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let fileSummariesSeq = 0;
let openFileSeq = 0;

/** `null` when closed; distinguishes new file vs new folder in a single shadcn `Dialog`. */
const newEntryDialogKind = ref<"file" | "folder" | null>(null);
const newEntryPathDraft = ref("");
const newEntryPathInputRef = ref<InstanceType<typeof Input> | null>(null);
const newEntryDialogFieldError = ref<string | null>(null);

type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  resolve: (confirmed: boolean) => void;
};

const confirmAction = ref<ConfirmActionState | null>(null);

const newEntryPathInputId = computed(() =>
  newEntryDialogKind.value === "folder" ? "new-folder-path-input" : "new-file-path-input"
);

const hasWorkspace = computed(() => Boolean(props.worktreePath));
const dirty = computed(
  () => selectedPath.value !== null && draftContent.value !== loadedContent.value
);
const isMarkdownFile = computed(() => {
  const p = selectedPath.value?.toLowerCase() ?? "";
  return p.endsWith(".md") || p.endsWith(".markdown");
});

const isImagePreviewFile = computed(() => {
  const p = selectedPath.value;
  return Boolean(p && IMAGE_PREVIEW_EXTENSIONS.has(fileExtensionLower(p)));
});

const isRasterImageFile = computed(() => {
  const p = selectedPath.value;
  return Boolean(p && RASTER_IMAGE_EXTENSIONS.has(fileExtensionLower(p)));
});

/** Raster images edited as text cannot be saved safely as UTF-8. */
const rasterImageSaveBlocked = computed(() => isRasterImageFile.value && dirty.value);

const mdViewMode = ref<"read" | "source">("read");

const mdViewTabs = computed<PillTabItem[]>(() => [
  { value: "read", label: "Read" },
  { value: "source", label: "Source" }
]);

const imageFileViewMode = ref<"preview" | "text">("preview");

const imageViewTabs = computed<PillTabItem[]>(() => [
  { value: "preview", label: "Preview" },
  { value: "text", label: "Source" }
]);

/** `data:` URL for `<img src>` when the open file is an image in the worktree. */
const imagePreviewSrc = ref<string | null>(null);

/** Dropped OS file (e.g. screencapture in temp) — not a worktree-relative selection. */
const externalDropPreview = ref<{ src: string; title: string } | null>(null);

const codeMirrorRef = ref<InstanceType<typeof CodeMirrorEditor> | null>(null);

const findInFileShortcutHint = computed(() =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    ? "⌘F"
    : "Ctrl+F"
);

const canFindInFile = computed(
  () =>
    Boolean(selectedPath.value) &&
    !editorCollapsed.value &&
    !isLoadingFile.value &&
    !(isMarkdownFile.value && mdViewMode.value === "read") &&
    !(isImagePreviewFile.value && imageFileViewMode.value === "preview")
);

function openFindInFile(): void {
  codeMirrorRef.value?.openFind();
}

const markdownHtml = computed(() => {
  if (!isMarkdownFile.value) return "";
  return renderMarkdownToHtml(draftContent.value);
});

/** Stable primitives for CodeMirror Markdown image previews (avoid resetting the editor each keystroke). */
const markdownImageWorkspaceRoot = computed(() =>
  isMarkdownFile.value && props.worktreePath ? props.worktreePath : null
);
const markdownImageFilePath = computed(() =>
  isMarkdownFile.value && selectedPath.value ? selectedPath.value : null
);

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

function collectFilePathsFromTree(nodes: FileTreeNodeData[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "file") out.push(node.path);
    else out.push(...collectFilePathsFromTree(node.children));
  }
  return out;
}

function ancestorFolderPathsForFile(relativePath: string): string[] {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length <= 1) return [];
  const out: string[] = [];
  let acc = "";
  for (let i = 0; i < segments.length - 1; i++) {
    acc = acc ? `${acc}/${segments[i]}` : segments[i]!;
    out.push(acc);
  }
  return out;
}

function ancestorFoldersForAllVisibleFiles(nodes: FileTreeNodeData[]): string[] {
  const folders = new Set<string>();
  for (const filePath of collectFilePathsFromTree(nodes)) {
    for (const a of ancestorFolderPathsForFile(filePath)) {
      folders.add(a);
    }
  }
  return [...folders];
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

const summariesForTree = computed(() => {
  const files = allFiles.value;
  /** Path mode never filters by query here — avoids rebuilding the whole tree on every keystroke. */
  if (searchMode.value === "path") {
    return files;
  }

  const q = debouncedQuery.value.trim();
  if (!q) return files;

  const matches = new Set(contentMatchPaths.value);
  if (matches.size === 0) return [];

  return files.filter((f) => {
    if (f.kind === "directory") {
      const p = f.relativePath;
      const prefix = `${p}/`;
      for (const m of matches) {
        if (m === p || m.startsWith(prefix)) return true;
      }
      return false;
    }
    return matches.has(f.relativePath);
  });
});

const fileTree = computed(() => buildFileTree(summariesForTree.value));

const visibleTree = computed(() => {
  if (!debouncedQuery.value.trim()) return fileTree.value;
  if (searchMode.value === "content") return fileTree.value;
  return filterTreeNodes(fileTree.value, debouncedQuery.value);
});

const searchModeTabs = computed<PillTabItem[]>(() => [
  { value: "path", label: "Path" },
  { value: "content", label: "Text" }
]);

const searchPlaceholder = computed(() =>
  searchMode.value === "content" ? "Search text in files…" : "Search paths…"
);

watchDebounced(
  () => query.value,
  (v) => {
    debouncedQuery.value = v;
  },
  { debounce: SEARCH_INPUT_DEBOUNCE_MS, flush: "post" }
);

/** Empty or whitespace-only query clears the debounced filter immediately (no extra delay). */
watch(query, (v) => {
  error.value = null;
  if (!v.trim()) {
    debouncedQuery.value = "";
  }
});

/** Avoid stale debounced text when switching mode or workspace. */
watch([() => searchMode.value, () => props.worktreePath], () => {
  debouncedQuery.value = query.value;
});

/** Path mode: on first character of a debounced search, expand folders that lead to visible files. */
watch(debouncedQuery, (next, prev) => {
  if ((prev ?? "").trim().length > 0 || next.trim().length === 0) return;
  if (searchMode.value !== "path") return;
  const nextExpanded = new Set(expandedFolders.value);
  for (const f of ancestorFoldersForAllVisibleFiles(visibleTree.value)) {
    nextExpanded.add(f);
  }
  expandedFolders.value = nextExpanded;
});

/** Content mode: when results arrive, expand folders along matching files. */
watch(
  contentMatchPaths,
  () => {
    if (searchMode.value !== "content" || !debouncedQuery.value.trim()) return;
    const nextExpanded = new Set(expandedFolders.value);
    for (const f of ancestorFoldersForAllVisibleFiles(visibleTree.value)) {
      nextExpanded.add(f);
    }
    expandedFolders.value = nextExpanded;
  },
  { flush: "post" }
);

watch(
  [() => debouncedQuery.value, () => searchMode.value, () => props.worktreePath],
  async () => {
    if (searchMode.value !== "content") {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }
    if (!props.worktreePath) {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }

    const q = debouncedQuery.value.trim();
    if (!q) {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }

    const api = getApi();
    const cwd = props.worktreePath;
    const seq = ++contentSearchSeq;
    contentSearchError.value = null;
    isContentSearching.value = true;

    if (!api?.searchFileContents) {
      contentMatchPaths.value = [];
      contentSearchError.value = "Full-text search is not available in this build.";
      if (seq === contentSearchSeq) {
        isContentSearching.value = false;
      }
      return;
    }

    try {
      const paths = await api.searchFileContents(cwd, q);
      if (seq !== contentSearchSeq || props.worktreePath !== cwd) return;
      contentMatchPaths.value = paths;
    } catch (searchErr) {
      if (seq !== contentSearchSeq || props.worktreePath !== cwd) return;
      contentMatchPaths.value = [];
      contentSearchError.value =
        searchErr instanceof Error ? searchErr.message : "Could not search file contents.";
    } finally {
      if (seq === contentSearchSeq) {
        isContentSearching.value = false;
      }
    }
  },
  { flush: "post" }
);

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

function closeNewEntryDialog(): void {
  newEntryDialogKind.value = null;
  newEntryDialogFieldError.value = null;
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

  newEntryPathDraft.value = computeNewFileDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined
  );
  newEntryDialogFieldError.value = null;
  newEntryDialogKind.value = "file";
  await nextTick();
  const el = newEntryPathInputRef.value;
  el?.focus();
  el?.select();
}

async function openNewFolderDialog(folderPathPrefix?: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api?.createFolder || !cwd) return;

  newEntryPathDraft.value = computeNewFolderDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined
  );
  newEntryDialogFieldError.value = null;
  newEntryDialogKind.value = "folder";
  await nextTick();
  const el = newEntryPathInputRef.value;
  el?.focus();
  el?.select();
}

async function submitNewEntry(): Promise<void> {
  const kind = newEntryDialogKind.value;
  const api = getApi();
  const cwd = props.worktreePath;
  if (!kind || !api || !cwd) return;

  if (kind === "file") {
    const normalized = normalizeNewFilePathInput(newEntryPathDraft.value);
    if (!normalized || normalized.endsWith("/")) {
      newEntryDialogFieldError.value = "Enter a file path (not a folder).";
      return;
    }

    newEntryDialogFieldError.value = null;
    error.value = null;

    try {
      await api.createFile(cwd, normalized);
      closeNewEntryDialog();
      await loadFileSummaries();
      expandAncestorFolders(normalized);
      if (!(await confirmDiscardIfDirty())) return;
      await openFile(normalized);
    } catch (createError) {
      error.value =
        createError instanceof Error ? createError.message : "Could not create the file.";
    }
    return;
  }

  if (!api.createFolder) return;

  const normalized = normalizeNewFilePathInput(newEntryPathDraft.value).replace(/\/+$/, "");
  if (!normalized) {
    newEntryDialogFieldError.value = "Enter a folder path.";
    return;
  }

  newEntryDialogFieldError.value = null;
  error.value = null;

  try {
    await api.createFolder(cwd, normalized);
    closeNewEntryDialog();
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
    if (newEntryDialogKind.value) {
      closeNewEntryDialog();
      return;
    }
  }
}

function clearSelection(): void {
  selectedPath.value = null;
  loadedContent.value = "";
  draftContent.value = "";
  imagePreviewSrc.value = null;
  imageFileViewMode.value = "preview";
  externalDropPreview.value = null;
}

function clearExternalDropPreview(): void {
  externalDropPreview.value = null;
}

async function onImageDropFromOs(e: DragEvent): Promise<void> {
  e.preventDefault();
  const df = e.dataTransfer;
  if (!df?.files?.length) return;
  const file = df.files[0];
  if (!file) return;
  const api = getApi();
  if (!api?.readImageDataUrlFromAbsolutePath || !api.getPathForFile) return;
  try {
    const abs = api.getPathForFile(file);
    const imageish =
      Boolean(file.type && file.type.startsWith("image/")) ||
      /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i.test(abs);
    if (!imageish) return;
    const url = await api.readImageDataUrlFromAbsolutePath(abs);
    if (url) externalDropPreview.value = { src: url, title: abs };
  } catch {
    /* ignore invalid drops */
  }
}

async function refreshImagePreviewUrl(): Promise<void> {
  const path = selectedPath.value;
  const cwd = props.worktreePath;
  const api = getApi();
  if (!path || !cwd || !api?.resolveMarkdownImageUrl) {
    imagePreviewSrc.value = null;
    return;
  }
  const name = basenameFromPath(path);
  imagePreviewSrc.value = (await api.resolveMarkdownImageUrl(cwd, path, name)) ?? null;
}

async function loadImageFileAsText(): Promise<void> {
  const path = selectedPath.value;
  const cwd = props.worktreePath;
  const api = getApi();
  if (!path || !cwd || !api) return;

  isLoadingFile.value = true;
  error.value = null;
  try {
    const content = await api.readFile(cwd, path);
    loadedContent.value = content;
    draftContent.value = content;
  } catch (readError) {
    error.value =
      readError instanceof Error ? readError.message : "Could not read the image file as text.";
  } finally {
    isLoadingFile.value = false;
  }
}

async function onImageViewModeRequest(next: string): Promise<void> {
  if (next !== "preview" && next !== "text") return;
  if (next === imageFileViewMode.value) return;

  if (next === "preview") {
    if (imageFileViewMode.value === "text" && dirty.value) {
      if (!(await confirmDiscardIfDirty())) return;
    }
    imageFileViewMode.value = "preview";
    loadedContent.value = "";
    draftContent.value = "";
    await refreshImagePreviewUrl();
    return;
  }

  imageFileViewMode.value = "text";
  await loadImageFileAsText();
}

async function handleCloseFileTab(): Promise<void> {
  if (!selectedPath.value) return;
  if (!(await confirmDiscardIfDirty())) return;
  clearSelection();
}

function invalidatePendingFileRequests(): void {
  fileSummariesSeq += 1;
  openFileSeq += 1;
  contentSearchSeq += 1;
  isSearching.value = false;
  isLoadingFile.value = false;
  isContentSearching.value = false;
}

function resetState(): void {
  query.value = "";
  debouncedQuery.value = "";
  searchMode.value = "path";
  allFiles.value = [];
  contentMatchPaths.value = [];
  contentSearchError.value = null;
  isContentSearching.value = false;
  contentSearchSeq += 1;
  expandedFolders.value = new Set();
  error.value = null;
  isSearching.value = false;
  isLoadingFile.value = false;
  isSaving.value = false;
  closeNewEntryDialog();
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
    imagePreviewSrc.value = null;
    const ext = fileExtensionLower(relativePath);
    if (IMAGE_PREVIEW_EXTENSIONS.has(ext)) {
      selectedPath.value = relativePath;
      imageFileViewMode.value = "preview";
      loadedContent.value = "";
      draftContent.value = "";
      await refreshImagePreviewUrl();
      if (seq !== openFileSeq || props.worktreePath !== cwd) return;
      return;
    }

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

  if (isRasterImageFile.value && dirty.value) {
    error.value =
      "Raster images cannot be saved from Source view; that would corrupt the file. Revert or switch back to Preview.";
    return;
  }

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

function toggleEditorCollapsed(): void {
  editorCollapsed.value = !editorCollapsed.value;
}

function toggleLineNumbers(): void {
  showLineNumbers.value = !showLineNumbers.value;
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

watch(selectedPath, (path) => {
  externalDropPreview.value = null;
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
      :class="sidebarCollapsed ? 'w-11' : 'w-80'"
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
          class="flex flex-col gap-1 border-b border-border p-1"
        >
          <div class="relative min-w-0 text-muted-foreground">
            <Search
              class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
            />
            <Input
              id="file-search"
              ref="searchInput"
              v-model="query"
              data-testid="file-search-input"
              type="text"
              :placeholder="searchPlaceholder"
              class="h-8 min-w-0 w-full rounded-md bg-muted py-1 pr-2 pl-8 text-xs focus-visible:ring-2"
              :disabled="!hasWorkspace"
            />
          </div>
          <div class="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <PillTabs
              v-model="searchMode"
              data-testid="file-search-mode-tabs"
              size="sm"
              class="min-w-0 flex-1 [&_[role=tablist]]:justify-start [&_[role=tablist]]:gap-1 [&_[role=tablist]]:px-0"
              aria-label="File search mode"
              :tabs="searchModeTabs"
            />
            <div
              class="flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/20 p-0.5"
              role="toolbar"
              aria-label="File explorer actions"
            >
              <Button
                data-testid="refresh-file-explorer"
                variant="ghost"
                size="icon-xs"
                class="size-7 shrink-0"
                :disabled="!hasWorkspace || isSearching"
                :title="'Refresh file explorer'"
                @click="loadFileSummaries"
              >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
                <span class="sr-only">Refresh file explorer</span>
              </Button>
              <Button
                data-testid="add-file"
                variant="ghost"
                size="icon-xs"
                class="size-7 shrink-0"
                :disabled="!hasWorkspace"
                :title="'Add file'"
                @click="handleAddFile()"
              >
                <FilePlus class="h-3.5 w-3.5" aria-hidden="true" />
                <span class="sr-only">Add file</span>
              </Button>
              <Button
                data-testid="add-folder"
                variant="ghost"
                size="icon-xs"
                class="size-7 shrink-0"
                :disabled="!hasWorkspace"
                :title="'Add folder'"
                @click="handleAddFolder()"
              >
                <FolderPlus class="h-3.5 w-3.5" aria-hidden="true" />
                <span class="sr-only">Add folder</span>
              </Button>
              <Button
                data-testid="file-search-sidebar-collapse"
                variant="ghost"
                size="icon-xs"
                class="size-7 shrink-0"
                :title="'Hide file explorer'"
                @click="collapseSidebar()"
              >
                <PanelLeftClose class="h-3.5 w-3.5" aria-hidden="true" />
                <span class="sr-only">Hide file explorer</span>
              </Button>
            </div>
          </div>
        </div>

        <ContextMenu>
          <ContextMenuTrigger as-child>
            <div
              data-testid="file-tree-scroll"
              class="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-2 py-2 [scrollbar-width:thin]"
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
                v-else-if="
                  searchMode === 'content' &&
                    debouncedQuery.trim() &&
                    contentSearchError
                "
                class="px-1.5 py-2 text-xs text-destructive"
              >
                {{ contentSearchError }}
              </p>
              <p
                v-else-if="
                  searchMode === 'content' && debouncedQuery.trim() && isContentSearching
                "
                class="px-1.5 py-2 text-xs text-muted-foreground"
              >
                Searching file contents…
              </p>
              <p
                v-else-if="
                  searchMode === 'content' &&
                    debouncedQuery.trim() &&
                    !isContentSearching &&
                    contentMatchPaths.length === 0 &&
                    !contentSearchError
                "
                class="px-1.5 py-2 text-xs text-muted-foreground"
              >
                No files contain matching text.
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

    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col"
      @dragover.prevent
      @drop="onImageDropFromOs"
    >
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
            data-testid="toggle-line-numbers"
            variant="outline"
            size="xs"
            :disabled="!selectedPath || (isImagePreviewFile && imageFileViewMode === 'preview')"
            :aria-pressed="showLineNumbers"
            :title="showLineNumbers ? 'Hide line numbers' : 'Show line numbers'"
            @click="toggleLineNumbers"
          >
            Lines
          </Button>
          <Button
            data-testid="find-in-file"
            variant="outline"
            size="xs"
            :disabled="!canFindInFile"
            :title="`Find in file (${findInFileShortcutHint})`"
            @click="openFindInFile"
          >
            Find
          </Button>
          <Button
            data-testid="toggle-file-editor-body"
            type="button"
            variant="outline"
            size="icon-xs"
            class="px-1.5"
            :disabled="!selectedPath"
            :title="editorCollapsed ? 'Expand editor' : 'Collapse editor'"
            :aria-label="editorCollapsed ? 'Expand editor' : 'Collapse editor'"
            :aria-expanded="selectedPath ? !editorCollapsed : true"
            aria-controls="file-editor-body"
            @click="toggleEditorCollapsed"
          >
            <Maximize2 v-if="editorCollapsed" class="h-3.5 w-3.5" aria-hidden="true" />
            <Minimize2 v-else class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">{{ editorCollapsed ? "Expand editor" : "Collapse editor" }}</span>
          </Button>
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
            :disabled="!selectedPath || !dirty || isSaving || rasterImageSaveBlocked"
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
        id="file-editor-body"
        data-testid="file-editor-body"
        class="relative flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          v-if="selectedPath && editorCollapsed"
          data-testid="file-editor-collapsed-state"
          class="flex min-h-[6rem] flex-1 items-center justify-center rounded-md bg-muted/10 px-4 py-6 text-xs text-muted-foreground"
        >
          Editor collapsed.
        </div>
        <template v-else>
          <div
            v-if="isMarkdownFile && selectedPath"
            class="absolute top-2 right-3 z-20 flex flex-col items-end gap-1 rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
          >
            <PillTabs
              v-model="mdViewMode"
              class="min-w-0 shrink-0 [&_[role=tablist]]:px-0 [&_[role=tablist]]:py-0"
              aria-label="Markdown view"
              :tabs="mdViewTabs"
            />
            <Button
              v-if="mdViewMode === 'source'"
              data-testid="markdown-source-image-previews-toggle"
              type="button"
              variant="ghost"
              size="xs"
              class="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              :title="
                mdSourceImagePreviews
                  ? 'Show Markdown source without inline image previews'
                  : 'Show resolved images under image syntax in the editor'
              "
              @click="mdSourceImagePreviews = !mdSourceImagePreviews"
            >
              {{ mdSourceImagePreviews ? "Hide image previews" : "Show image previews" }}
            </Button>
          </div>
          <div
            v-if="isImagePreviewFile && selectedPath"
            class="absolute top-2 right-3 z-20 rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
          >
            <PillTabs
              :model-value="imageFileViewMode"
              class="min-w-0 shrink-0 [&_[role=tablist]]:px-0 [&_[role=tablist]]:py-0"
              aria-label="Image view"
              :tabs="imageViewTabs"
              @update:model-value="onImageViewModeRequest"
            />
          </div>
          <p
            v-if="error && selectedPath"
            class="mb-2 px-4 pt-2 text-xs text-destructive"
          >
            {{ error }}
          </p>
          <div
            v-else-if="!selectedPath"
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
            v-else-if="isImagePreviewFile && imageFileViewMode === 'preview' && imagePreviewSrc"
            data-testid="image-file-preview"
            class="flex min-h-[18rem] flex-1 flex-col items-center justify-center overflow-auto rounded-md bg-muted/10 px-4 py-6"
          >
            <img
              :src="imagePreviewSrc"
              :alt="`Preview of ${selectedPath}`"
              class="max-h-[min(70vh,48rem)] max-w-full rounded-md border border-border/60 object-contain shadow-sm"
              draggable="false"
            />
          </div>
          <div
            v-else-if="isImagePreviewFile && imageFileViewMode === 'preview' && !imagePreviewSrc"
            data-testid="image-file-preview-unavailable"
            class="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-2 rounded-md bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground"
            role="status"
          >
            <p class="max-w-sm">
              Could not build a preview (missing binary, Git LFS pointer not smudged, wrong file type, or over 32 MB).
            </p>
            <p>
              Use <span class="font-medium text-foreground">Source</span> to inspect the file, or run
              <span class="font-mono">git lfs pull</span> if this is an LFS asset.
            </p>
            <p class="text-[11px] text-muted-foreground/90">
              For screenshots in macOS TemporaryItems: drag the file onto this pane (temp folder is allowed), or copy
              the image into the repo.
            </p>
          </div>
          <div
            v-else-if="isMarkdownFile && mdViewMode === 'read'"
            data-testid="markdown-preview"
            class="markdown-reader h-full min-h-[18rem] overflow-y-auto rounded-md bg-muted/10 px-3 py-3"
            v-html="markdownHtml"
          />
          <CodeMirrorEditor
            v-else
            ref="codeMirrorRef"
            v-model="draftContent"
            :language="editorLanguage"
            :show-line-numbers="showLineNumbers"
            :markdown-workspace-root="markdownImageWorkspaceRoot"
            :markdown-file-path="markdownImageFilePath"
            :markdown-image-preview-enabled="mdSourceImagePreviews"
            :aria-label="
              selectedPath
                ? `Source code, ${editorLanguage ?? 'plain text'}, ${selectedPath}`
                : undefined
            "
          />
        </template>
      </div>
      <div
        v-if="externalDropPreview"
        data-testid="external-image-drop-preview"
        class="shrink-0 border-t border-border bg-muted/25 px-4 py-3"
      >
        <div class="flex items-start justify-between gap-2">
          <p class="min-w-0 text-[11px] leading-snug text-muted-foreground">
            <span class="font-medium text-foreground">Dropped image</span>
            (not in the file tree). Save a copy under the worktree to open it in the editor.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="shrink-0"
            aria-label="Dismiss dropped image preview"
            @click="clearExternalDropPreview"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
        <p
          class="mt-1 truncate font-mono text-[10px] text-muted-foreground"
          :title="externalDropPreview.title"
        >
          {{ externalDropPreview.title }}
        </p>
        <img
          :src="externalDropPreview.src"
          alt=""
          class="mt-2 max-h-72 max-w-full rounded-md border border-border/60 object-contain shadow-sm"
          draggable="false"
        />
      </div>
    </div>

    <Dialog
      :open="newEntryDialogKind !== null"
      @update:open="(open) => (!open ? closeNewEntryDialog() : undefined)"
    >
      <DialogContent
        :data-testid="newEntryDialogKind === 'folder' ? 'new-folder-dialog' : 'new-file-dialog'"
        class="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle
            :id="newEntryDialogKind === 'folder' ? 'new-folder-dialog-title' : 'new-file-dialog-title'"
          >
            {{ newEntryDialogKind === "folder" ? "New folder" : "New file" }}
          </DialogTitle>
          <DialogDescription v-if="newEntryDialogKind === 'file'" class="text-xs">
            Path relative to the workspace (use <span class="font-mono">/</span> for folders).
          </DialogDescription>
          <DialogDescription v-else-if="newEntryDialogKind === 'folder'" class="text-xs">
            Path relative to the workspace (nested folders are created as needed).
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-3" @submit.prevent="submitNewEntry">
          <div>
            <label :for="newEntryPathInputId" class="sr-only">
              {{ newEntryDialogKind === "folder" ? "Folder path" : "File path" }}
            </label>
            <Input
              :id="newEntryPathInputId"
              ref="newEntryPathInputRef"
              v-model="newEntryPathDraft"
              :data-testid="
                newEntryDialogKind === 'folder' ? 'new-folder-path-input' : 'new-file-path-input'
              "
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="h-9 w-full rounded-md bg-background px-2.5 text-xs focus-visible:ring-2"
              :placeholder="
                newEntryDialogKind === 'folder'
                  ? 'e.g. src/components/MyFolder'
                  : 'e.g. src/components/MyFile.ts'
              "
            />
            <p
              v-if="newEntryDialogFieldError"
              :data-testid="
                newEntryDialogKind === 'folder' ? 'new-folder-dialog-error' : 'new-file-dialog-error'
              "
              class="mt-1.5 text-xs text-destructive"
            >
              {{ newEntryDialogFieldError }}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              :data-testid="newEntryDialogKind === 'folder' ? 'new-folder-cancel' : 'new-file-cancel'"
              variant="outline"
              @click="closeNewEntryDialog"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              :data-testid="newEntryDialogKind === 'folder' ? 'new-folder-confirm' : 'new-file-confirm'"
              variant="default"
            >
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
          <AlertDialogCancel as-child>
            <Button
              type="button"
              variant="outline"
              data-testid="confirm-action-cancel"
              @click="settleConfirmation(false)"
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button
              type="button"
              :variant="confirmAction?.variant === 'destructive' ? 'destructive' : 'default'"
              data-testid="confirm-action-confirm"
              @click="settleConfirmation(true)"
            >
              {{ confirmAction?.confirmLabel ?? "Continue" }}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
