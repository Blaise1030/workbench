import type { Project, Thread, ThreadSession, ThreadAgent, Worktree } from "./domain";

export { IPC_CHANNELS } from "../../electron/ipcChannels.js";

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
