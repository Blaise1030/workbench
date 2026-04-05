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
  runStart: "run:start",
  runSendInput: "run:sendInput",
  runInterrupt: "run:interrupt",
  diffChangedFiles: "diff:changedFiles",
  diffFileDiff: "diff:fileDiff",
  diffWorkingTree: "diff:workingTree",
  diffStageAll: "diff:stageAll",
  diffDiscardAll: "diff:discardAll",
  filesSearch: "files:search",
  filesRead: "files:read",
  filesWrite: "files:write",
  editApplyPatch: "edit:applyPatch",
  previewSetUrl: "preview:setUrl",
  previewProbeUrl: "preview:probeUrl",
  terminalPtyCreate: "terminal:ptyCreate",
  terminalPtyWrite: "terminal:ptyWrite",
  terminalPtyResize: "terminal:ptyResize",
  terminalPtyKill: "terminal:ptyKill",
  terminalPtyListSessions: "terminal:ptyListSessions",
  terminalPtyData: "terminal:ptyData",
  dialogPickRepoDirectory: "dialog:pickRepoDirectory"
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

export interface FileWriteInput extends FileReadInput {
  content: string;
}

/** Result of checking whether a preview URL responds (main process; no CORS). */
export type PreviewProbeResult =
  | { ok: true; status: number }
  | { ok: false; code: "invalid" | "network"; message: string };
