import type { Project, Thread, ThreadSession, ThreadAgent, Worktree } from "./domain";

export const IPC_CHANNELS = {
  workspaceGetSnapshot: "workspace:getSnapshot",
  workspaceAddProject: "workspace:addProject",
  workspaceRemoveProject: "workspace:removeProject",
  workspaceReorderProjects: "workspace:reorderProjects",
  workspaceAddWorktree: "workspace:addWorktree",
  workspaceSetActive: "workspace:setActive",
  workspaceCreateThread: "workspace:createThread",
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
  diffFileMergeSides: "diff:fileMergeSides",
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
  /** Checkout an existing local branch in the given worktree directory. */
  diffGitCheckoutBranch: "diff:gitCheckoutBranch",
  diffIsGitRepository: "diff:isGitRepository",
  diffInitGitRepository: "diff:initGitRepository",
  filesList: "files:list",
  filesSearch: "files:search",
  filesSearchContent: "files:searchContent",
  filesRead: "files:read",
  /** Resolve `![](href)` in a Markdown file to a loadable URL (`data:` for workspace images, pass-through for http(s)). */
  filesResolveMarkdownImageUrl: "files:resolveMarkdownImageUrl",
  /** Read an image outside the worktree (e.g. temp screencapture) as `data:` — restricted to temp + user media folders. */
  filesReadImageDataUrlFromAbsolutePath: "files:readImageDataUrlFromAbsolutePath",
  filesWrite: "files:write",
  filesCreate: "files:create",
  filesDelete: "files:delete",
  filesCreateFolder: "files:createFolder",
  filesDeleteFolder: "files:deleteFolder",
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
  workspaceCreateWorktreeGroup: "workspace:createWorktreeGroup",
  workspaceDeleteWorktreeGroup: "workspace:deleteWorktreeGroup",
  workspaceListBranches: "workspace:listBranches",
  workspaceWorktreeHealth: "workspace:worktreeHealth",
  workspaceSyncWorktrees: "workspace:syncWorktrees",
  /** macOS often captures ⌘, for the app menu; main sends this so the renderer can open settings. */
  uiOpenWorkspaceSettings: "ui:openWorkspaceSettings",
  /** Running app semver from Electron `app.getVersion()`. */
  appGetVersion: "app:getVersion",
  /** GitHub-style release tag for this build (from bundled `package.json` semver when available). */
  appGetReleaseTag: "app:getReleaseTag",
  /** Packaged app only: GitHub latest release vs bundled app semver (same source as release tag). */
  appGetUpdateAvailability: "app:getUpdateAvailability",
  /** Open a validated https URL in the system browser (GitHub only). */
  appOpenExternalUrl: "app:openExternalUrl"
} as const;

export interface WorkspaceSnapshot {
  projects: Project[];
  worktrees: Worktree[];
  threads: Thread[];
  threadSessions: ThreadSession[];
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

export interface AddProjectInput {
  name: string;
  repoPath: string;
  defaultBranch?: string;
}

export interface RemoveProjectInput {
  projectId: string;
}

export interface ReorderProjectsInput {
  /** Full project tab order, left to right. */
  orderedProjectIds: string[];
}

export interface CreateWorktreeGroupInput {
  projectId: string;
  /** Existing branch name, or new branch to create. */
  branch: string;
  /** When creating a new branch, the base to branch from. Null if using existing branch. */
  baseBranch: string | null;
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

export interface FileAbsolutePathInput {
  absolutePath: string;
}

/** Resolve a Markdown image `href` relative to `markdownRelativePath` inside `cwd`. */
export interface FileResolveMarkdownImageUrlInput extends FileReadInput {
  /** Raw `href` from `![](...)` (may be relative, URL, or data URI). */
  href: string;
}

export interface FileSummary {
  relativePath: string;
  size: number;
  modifiedAt: number;
  /** When `"directory"`, this path is an empty folder (or folder-only path) so the tree can show it. */
  kind?: "file" | "directory";
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

/** Two full texts for CodeMirror `MergeView` (per-file source control). */
export type FileMergeSidesResult =
  | {
      kind: "ok";
      original: string;
      modified: string;
      /** Short label for the left pane (e.g. `HEAD`, `Staged`). */
      originalLabel: string;
      /** Short label for the right pane (e.g. `Staged`, `Working tree`). */
      modifiedLabel: string;
    }
  | { kind: "binary" }
  | { kind: "error"; message: string };

/** When a newer GitHub release exists than the running packaged build. */
export interface AppUpdateAvailability {
  currentVersion: string;
  latestVersion: string;
  /** Full tag from GitHub (often `v1.2.3`). */
  latestTag: string;
  /** Release page with notes and download assets. */
  releasePageUrl: string;
  /** Compare range for commit-level changes since the running version. */
  compareUrl: string;
}

/** Result of checking whether a preview URL responds (main process; no CORS). */
export type PreviewProbeResult =
  | { ok: true; status: number }
  | { ok: false; code: "invalid" | "network"; message: string };
