/// <reference types="vite/client" />
import type {
  AddProjectInput,
  AddWorktreeInput,
  AppUpdateAvailability,
  CreateThreadInput,
  CreateWorktreeGroupInput,
  DeleteThreadInput,
  FileDiffScope,
  FileMergeSidesResult,
  FileSummary,
  RemoveProjectInput,
  RenameThreadInput,
  ReorderProjectsInput,
  UpdateThreadInput,
  WorktreeEditorState,
  PreviewProbeResult,
  RepoScmSnapshot,
  RepoStatusEntry,
  StagedUnifiedDiffResult,
  GitWorktreeListEntry
} from "@shared/ipc";

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_WORKSPACE_SNAPSHOT_TRANSPORT?: "ipc" | "rpc" | "http";
  readonly VITE_WORKSPACE_SNAPSHOT_HTTP_URL?: string;
}

interface WorkspaceApi {
  getSnapshot: () => Promise<unknown>;
  addProject: (payload: AddProjectInput) => Promise<unknown>;
  removeProject?: (payload: RemoveProjectInput) => Promise<void>;
  reorderProjects?: (payload: ReorderProjectsInput) => Promise<void>;
  addWorktree: (payload: AddWorktreeInput) => Promise<unknown>;
  setActive: (payload: { projectId: string | null; worktreeId: string | null; threadId: string | null }) => Promise<void>;
  getWorktreeEditorState?: (worktreeId: string) => Promise<WorktreeEditorState | null>;
  setWorktreeEditorState?: (payload: {
    worktreeId: string;
    selectedFilePath: string | null;
    openFilePaths: string[];
  }) => Promise<void>;
  createThread: (payload: CreateThreadInput) => Promise<unknown>;
  setActiveThread: (threadId: string) => Promise<unknown>;
  deleteThread: (payload: DeleteThreadInput) => Promise<void>;
  renameThread: (payload: RenameThreadInput) => Promise<void>;
  updateThread?: (payload: UpdateThreadInput) => Promise<void>;
  createWorktreeGroup?: (payload: CreateWorktreeGroupInput) => Promise<unknown>;
  deleteWorktreeGroup?: (payload: { worktreeId: string }) => Promise<void>;
  startRun: (payload: { agent: string; cwd: string; prompt: string }) => Promise<string>;
  sendRunInput: (runId: string, input: string) => Promise<void>;
  interruptRun: (runId: string) => Promise<void>;
  changedFiles: (cwd: string) => Promise<string[]>;
  isGitRepository?: (cwd: string) => Promise<boolean>;
  initGitRepository?: (cwd: string) => Promise<void>;
  repoStatus?: (cwd: string) => Promise<RepoScmSnapshot | RepoStatusEntry[]>;
  gitFetch?: (cwd: string) => Promise<void>;
  gitPush?: (cwd: string) => Promise<void>;
  commitStaged?: (cwd: string, message: string) => Promise<void>;
  /** Checkout a local branch in `cwd` (Electron); updates persisted worktree branch when path is known. */
  gitCheckoutBranch?: (cwd: string, branch: string) => Promise<void>;
  /** Lists Git worktrees for the repo containing the registered worktree root `cwd`. */
  gitListWorktrees?: (cwd: string) => Promise<GitWorktreeListEntry[]>;
  /** Local branches not checked out on another linked worktree (see `GitService.listBranchesExcludingWorktrees`). */
  gitListBranchesExcludingWorktrees?: (cwd: string) => Promise<string[]>;
  listBranches?: (projectId: string) => Promise<string[]>;
  fileDiff: (cwd: string, file: string, scope?: FileDiffScope) => Promise<string>;
  /** Two full texts for Git merge diff (Electron); optional on older preload builds. */
  fileMergeSides?: (cwd: string, file: string, scope: "staged" | "unstaged") => Promise<FileMergeSidesResult>;
  /** Full unstaged unified diff; omit on older preload builds (layout falls back per-file). */
  workingTreeDiff?: (cwd: string) => Promise<string>;
  /** Bounded staged (`git diff --cached`) unified diff for local LLM commit suggestions. */
  stagedUnifiedDiff?: (cwd: string) => Promise<StagedUnifiedDiffResult>;
  stageAll: (cwd: string) => Promise<void>;
  unstageAll?: (cwd: string) => Promise<void>;
  discardAll: (cwd: string) => Promise<void>;
  stagePaths?: (cwd: string, paths: string[]) => Promise<void>;
  unstagePaths?: (cwd: string, paths: string[]) => Promise<void>;
  discardPaths?: (cwd: string, paths: string[]) => Promise<void>;
  listFiles: (cwd: string) => Promise<FileSummary[]>;
  searchFiles: (cwd: string, query: string) => Promise<string[]>;
  /** Full-text search over file text (UTF-8); optional on older preload builds. */
  searchFileContents?: (cwd: string, query: string) => Promise<string[]>;
  readFile: (cwd: string, relativePath: string) => Promise<string>;
  /** Resolve `![](href)` for Markdown previews; optional on older preload builds. */
  resolveMarkdownImageUrl?: (cwd: string, markdownRelativePath: string, href: string) => Promise<string | null>;
  /** Read an image from an allowed absolute path (temp, Desktop, …) as `data:`; optional on older preload builds. */
  readImageDataUrlFromAbsolutePath?: (absolutePath: string) => Promise<string | null>;
  writeFile: (cwd: string, relativePath: string, content: string) => Promise<void>;
  createFile: (cwd: string, relativePath: string) => Promise<void>;
  deleteFile: (cwd: string, relativePath: string) => Promise<void>;
  createFolder: (cwd: string, relativePath: string) => Promise<void>;
  deleteFolder: (cwd: string, relativePath: string) => Promise<void>;
  applyPatch: (payload: { cwd: string; relativeFilePath: string; content: string }) => Promise<void>;
  /** @param sessionId Thread id or `__wt:${worktreeId}` when no thread is selected. */
  ptyCreate: (sessionId: string, cwd: string, worktreeId: string) => Promise<{ buffer: string; created?: boolean }>;
  ptyWrite: (sessionId: string, data: string) => Promise<void>;
  ptyResize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  ptyKill: (sessionId: string) => Promise<void>;
  /** Worktree IDs with an active integrated terminal session (Electron only). */
  ptyListSessions?: () => Promise<string[]>;
  /** Replay scrollback from the main process into xterm (Electron only). */
  ptyGetBuffer?: (sessionId: string) => Promise<{ buffer: string }>;
  onPtyData: (callback: (sessionId: string, data: string) => void) => () => void;
  onWindowFullscreenChanged?: (callback: (isFullscreen: boolean) => void) => () => void;
  onWorkspaceChanged?: (callback: () => void) => () => void;
  /** After save/create/delete/applyPatch in the active repo (Electron); refresh git diff. */
  onWorkingTreeFilesChanged?: (callback: () => void) => () => void;
  /** Main process fired after ⌘, / Ctrl+, (see `before-input-event` in Electron main). */
  onOpenWorkspaceSettings?: (callback: () => void) => () => void;
  syncWorktrees?: (projectId: string) => Promise<unknown>;
  /** Electron: absolute skill-directory roots from Settings → Agents (custom paths outside ~/.*/skills). */
  setAgentSkillSearchRoots?: (roots: string[]) => Promise<void>;
  pickRepoDirectory: () => Promise<string | null>;
  /** Present when running under Electron preload; maps a webkitdirectory file to the chosen folder path. */
  resolveRepoRootFromWebkitFile?: (file: File) => string;
  /** Present when running under Electron preload; absolute path for a dropped `File`. */
  getPathForFile?: (file: File) => string;
  /** Electron: `app.getVersion()` (semver string). */
  getAppVersion?: () => Promise<string>;
  /** Electron: `os.homedir()` for expanding `~` in agent skill directories and similar. */
  getUserHomeDir?: () => Promise<string>;
  /** Electron: GitHub-style release tag for this build (from bundled app semver). */
  getAppReleaseTag?: () => Promise<string>;
  /** Packaged Electron: latest GitHub release vs running version, or null. */
  getAppUpdateAvailability?: () => Promise<AppUpdateAvailability | null>;
  /** Open a validated https `github.com` URL in the default browser. */
  openAppExternalUrl?: (url: string) => Promise<void>;
  /** Main → renderer: hook-derived run state for a thread. */
  onThreadRunStateChanged?: (callback: (threadId: string, state: string) => void) => () => void;
}

/** Preview tab: main-process `BrowserView` + HTTP probe + opening the URL externally. */
interface PreviewApi {
  probeUrl: (url: string) => Promise<PreviewProbeResult>;
  openUrlExternally: (url: string) => Promise<void>;
  setNativeBounds: (bounds: import("@shared/ipc").PreviewBounds) => Promise<void>;
  loadNativeUrl: (url: string) => Promise<import("@shared/ipc").PreviewNativeLoadResult>;
  reloadNative: () => Promise<import("@shared/ipc").PreviewNativeLoadResult>;
  detachNative: () => Promise<void>;
  toggleEmbeddedDevTools: () => Promise<import("@shared/ipc").PreviewDevToolsToggleResult>;
  /** Subscribe to embedded preview DevTools open/closed (main → renderer). */
  onPreviewEmbeddedDevtoolsOpen?: (callback: (open: boolean) => void) => () => void;
}

declare global {
  interface Window {
    workspaceApi?: WorkspaceApi;
    previewApi?: PreviewApi;
  }
}
