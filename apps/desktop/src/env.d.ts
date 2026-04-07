/// <reference types="vite/client" />
import type { FileSummary } from "@shared/ipc";
import type { FileDiffScope, RepoScmSnapshot, RepoStatusEntry } from "@shared/ipc";

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

interface WorkspaceApi {
  getSnapshot: () => Promise<unknown>;
  addProject: (payload: unknown) => Promise<unknown>;
  addWorktree: (payload: unknown) => Promise<unknown>;
  setActive: (payload: { projectId: string | null; worktreeId: string | null; threadId: string | null }) => Promise<void>;
  createThread: (payload: unknown) => Promise<unknown>;
  reorderThreads: (payload: { worktreeId: string; orderedThreadIds: string[] }) => Promise<void>;
  setActiveThread: (threadId: string) => Promise<unknown>;
  deleteThread: (payload: { threadId: string }) => Promise<void>;
  renameThread: (payload: { threadId: string; title: string }) => Promise<void>;
  startRun: (payload: unknown) => Promise<string>;
  sendRunInput: (runId: string, input: string) => Promise<void>;
  interruptRun: (runId: string) => Promise<void>;
  changedFiles: (cwd: string) => Promise<string[]>;
  isGitRepository?: (cwd: string) => Promise<boolean>;
  initGitRepository?: (cwd: string) => Promise<void>;
  repoStatus?: (cwd: string) => Promise<RepoScmSnapshot | RepoStatusEntry[]>;
  gitFetch?: (cwd: string) => Promise<void>;
  gitPush?: (cwd: string) => Promise<void>;
  commitStaged?: (cwd: string, message: string) => Promise<void>;
  fileDiff: (cwd: string, file: string, scope?: FileDiffScope) => Promise<string>;
  /** Full unstaged unified diff; omit on older preload builds (layout falls back per-file). */
  workingTreeDiff?: (cwd: string) => Promise<string>;
  stageAll: (cwd: string) => Promise<void>;
  unstageAll?: (cwd: string) => Promise<void>;
  discardAll: (cwd: string) => Promise<void>;
  stagePaths?: (cwd: string, paths: string[]) => Promise<void>;
  unstagePaths?: (cwd: string, paths: string[]) => Promise<void>;
  discardPaths?: (cwd: string, paths: string[]) => Promise<void>;
  listFiles: (cwd: string) => Promise<FileSummary[]>;
  searchFiles: (cwd: string, query: string) => Promise<string[]>;
  readFile: (cwd: string, relativePath: string) => Promise<string>;
  writeFile: (cwd: string, relativePath: string, content: string) => Promise<void>;
  createFile: (cwd: string, relativePath: string) => Promise<void>;
  deleteFile: (cwd: string, relativePath: string) => Promise<void>;
  createFolder: (cwd: string, relativePath: string) => Promise<void>;
  deleteFolder: (cwd: string, relativePath: string) => Promise<void>;
  applyPatch: (payload: unknown) => Promise<void>;
  /** @param sessionId Thread id or `__wt:${worktreeId}` when no thread is selected. */
  ptyCreate: (sessionId: string, cwd: string, worktreeId: string) => Promise<{ buffer: string }>;
  ptyWrite: (sessionId: string, data: string) => Promise<void>;
  ptyResize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  ptyKill: (sessionId: string) => Promise<void>;
  /** Worktree IDs with an active integrated terminal session (Electron only). */
  ptyListSessions?: () => Promise<string[]>;
  /** Replay scrollback from the main process into xterm (Electron only). */
  ptyGetBuffer?: (sessionId: string) => Promise<{ buffer: string }>;
  onPtyData: (callback: (sessionId: string, data: string) => void) => () => void;
  onWorkspaceChanged?: (callback: () => void) => () => void;
  /** After save/create/delete/applyPatch in the active repo (Electron); refresh git diff. */
  onWorkingTreeFilesChanged?: (callback: () => void) => () => void;
  /** Main process fired after ⌘, / Ctrl+, (see `before-input-event` in Electron main). */
  onOpenWorkspaceSettings?: (callback: () => void) => () => void;
  syncWorktrees?: (projectId: string) => Promise<unknown>;
  pickRepoDirectory: () => Promise<string | null>;
  /** Present when running under Electron preload; maps a webkitdirectory file to the chosen folder path. */
  resolveRepoRootFromWebkitFile?: (file: File) => string;
  /** Present when running under Electron preload; absolute path for a dropped `File`. */
  getPathForFile?: (file: File) => string;
}

declare global {
  interface Window {
    workspaceApi?: WorkspaceApi;
  }
}
