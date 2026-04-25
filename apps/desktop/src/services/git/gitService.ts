import type { GitWorktreeListEntry } from "@shared/ipc";

/** Git operations abstracted from Electron IPC (see `ipcGitService.ts`). */
export interface GitService {
  /**
   * All Git worktrees for the repository that contains `cwd`.
   * `cwd` must be a registered worktree root (same rule as other workspace Git IPC).
   */
  listWorktrees(cwd: string): Promise<GitWorktreeListEntry[]>;
}
