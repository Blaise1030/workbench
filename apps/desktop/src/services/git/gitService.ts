import type { GitWorktreeListEntry } from "@shared/ipc";

/** Git operations abstracted from Electron IPC (see `ipcGitService.ts`). */
export interface GitService {
  /**
   * All Git worktrees for the repository that contains `cwd`.
   * `cwd` must be a registered worktree root (same rule as other workspace Git IPC).
   */
  listWorktrees(cwd: string): Promise<GitWorktreeListEntry[]>;

  /**
   * Local branch names for the repo containing `cwd`, excluding branches that are already
   * checked out on another linked worktree (Git does not allow the same branch in two
   * worktrees). The branch checked out at `cwd` remains listed.
   *
   * `cwd` must be a registered worktree root (same rule as other workspace Git IPC).
   */
  listBranchesExcludingWorktrees(cwd: string): Promise<string[]>;

  /**
   * Current checked-out branch short name for `cwd` (from repo status), or `HEAD` when
   * detached, or empty when unknown.
   *
   * `cwd` must be a registered worktree root (same rule as other workspace Git IPC).
   */
  getCurrentBranch(cwd: string): Promise<string>;

  /** Checkout an existing local branch in the worktree at `cwd` (updates persisted worktree branch when known). */
  checkoutBranch(cwd: string, branch: string): Promise<void>;
}
