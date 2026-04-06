import type { Project, Thread, ThreadAgent, Worktree } from "./domain";

export const IPC_CHANNELS = {
  workspaceGetSnapshot: "workspace:getSnapshot",
  workspaceAddProject: "workspace:addProject",
  workspaceAddWorktree: "workspace:addWorktree",
  workspaceSetActive: "workspace:setActive",
  workspaceCreateThread: "workspace:createThread",
  workspaceReorderThreads: "workspace:reorderThreads",
  workspaceSetActiveThread: "workspace:setActiveThread",
  workspaceDeleteThread: "workspace:deleteThread",
  workspaceRenameThread: "workspace:renameThread",
  workspaceDidChange: "workspace:didChange",
  /** Repo working tree may have changed (save, patch, etc.); refresh diff / git state in renderer. */
  workingTreeFilesDidChange: "diff:workingTreeFilesDidChange",
  runStart: "run:start",
  runSendInput: "run:sendInput",
  runInterrupt: "run:interrupt",
  diffChangedFiles: "diff:changedFiles",
  diffRepoStatus: "diff:repoStatus",
  diffFileDiff: "diff:fileDiff",
  diffWorkingTree: "diff:workingTree",
  diffStageAll: "diff:stageAll",
  diffUnstageAll: "diff:unstageAll",
  diffDiscardAll: "diff:discardAll",
  diffStagePaths: "diff:stagePaths",
  diffUnstagePaths: "diff:unstagePaths",
  diffDiscardPaths: "diff:discardPaths",
  diffGitFetch: "diff:gitFetch",
  diffGitPush: "diff:gitPush",
  diffGitCommit: "diff:gitCommit",
  diffIsGitRepository: "diff:isGitRepository",
  diffInitGitRepository: "diff:initGitRepository",
  filesList: "files:list",
  filesSearch: "files:search",
  filesRead: "files:read",
  filesWrite: "files:write",
  filesCreate: "files:create",
  filesDelete: "files:delete",
  editApplyPatch: "edit:applyPatch",
  previewSetUrl: "preview:setUrl",
  previewProbeUrl: "preview:probeUrl",
  terminalPtyCreate: "terminal:ptyCreate",
  terminalPtyWrite: "terminal:ptyWrite",
  terminalPtyResize: "terminal:ptyResize",
  terminalPtyKill: "terminal:ptyKill",
  terminalPtyListSessions: "terminal:ptyListSessions",
  terminalPtyGetBuffer: "terminal:ptyGetBuffer",
  terminalPtyData: "terminal:ptyData",
  dialogPickRepoDirectory: "dialog:pickRepoDirectory",
  /** macOS often captures ⌘, for the app menu; main sends this so the renderer can open settings. */
  uiOpenWorkspaceSettings: "ui:openWorkspaceSettings"
} as const;

export interface WorkspaceSnapshot {
  projects: Project[];
  worktrees: Worktree[];
  threads: Thread[];
  activeProjectId: string | null;
  activeWorktreeId: string | null;
  activeThreadId: string | null;
}

export interface CreateThreadInput {
  projectId: string;
  worktreeId: string;
  title: string;
  agent: ThreadAgent;
}

export interface ReorderThreadsInput {
  worktreeId: string;
  orderedThreadIds: string[];
}

export interface AddProjectInput {
  name: string;
  repoPath: string;
  defaultBranch?: string;
}

export interface AddWorktreeInput {
  projectId: string;
  branch: string;
  worktreePath: string;
}

export interface DeleteThreadInput {
  threadId: string;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}

export interface FileReadInput {
  cwd: string;
  relativePath: string;
}

export interface FileSummary {
  relativePath: string;
  size: number;
  modifiedAt: number;
}

export interface FileWriteInput extends FileReadInput {
  content: string;
}

export type RepoChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unmerged"
  | "untracked";

export interface RepoStatusEntry {
  path: string;
  originalPath: string | null;
  stagedKind: RepoChangeKind | null;
  unstagedKind: RepoChangeKind | null;
  isUntracked: boolean;
  /** From `git diff --cached --numstat`; null when absent or binary (`-`). */
  stagedLinesAdded: number | null;
  stagedLinesRemoved: number | null;
  /** From `git diff --numstat`; null when absent or binary (`-`). */
  unstagedLinesAdded: number | null;
  unstagedLinesRemoved: number | null;
}

/** Full source-control snapshot for the Git Diff sidebar (Electron). */
export interface RepoScmSnapshot {
  entries: RepoStatusEntry[];
  /** Current branch or `HEAD` when detached. */
  branch: string;
  /** Short folder label (worktree directory basename) for `short / branch` display. */
  shortLabel: string;
  lastCommitSubject: string | null;
}

export type FileDiffScope = "staged" | "unstaged" | "combined";

/** Result of checking whether a preview URL responds (main process; no CORS). */
export type PreviewProbeResult =
  | { ok: true; status: number }
  | { ok: false; code: "invalid" | "network"; message: string };
