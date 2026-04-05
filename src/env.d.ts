/// <reference types="vite/client" />

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
  setActiveThread: (threadId: string) => Promise<unknown>;
  startRun: (payload: unknown) => Promise<string>;
  sendRunInput: (runId: string, input: string) => Promise<void>;
  interruptRun: (runId: string) => Promise<void>;
  changedFiles: (cwd: string) => Promise<string[]>;
  fileDiff: (cwd: string, file: string) => Promise<string>;
  /** Full unstaged unified diff; omit on older preload builds (layout falls back per-file). */
  workingTreeDiff?: (cwd: string) => Promise<string>;
  stageAll: (cwd: string) => Promise<void>;
  discardAll: (cwd: string) => Promise<void>;
  applyPatch: (payload: unknown) => Promise<void>;
  ptyCreate: (worktreeId: string, cwd: string) => Promise<{ buffer: string }>;
  ptyWrite: (worktreeId: string, data: string) => Promise<void>;
  ptyResize: (worktreeId: string, cols: number, rows: number) => Promise<void>;
  ptyKill: (worktreeId: string) => Promise<void>;
  /** Worktree IDs with an active integrated terminal session (Electron only). */
  ptyListSessions?: () => Promise<string[]>;
  onPtyData: (callback: (worktreeId: string, data: string) => void) => () => void;
  pickRepoDirectory: () => Promise<string | null>;
  /** Present when running under Electron preload; maps a webkitdirectory file to the chosen folder path. */
  resolveRepoRootFromWebkitFile?: (file: File) => string;
}

declare global {
  interface Window {
    workspaceApi?: WorkspaceApi;
  }
}
