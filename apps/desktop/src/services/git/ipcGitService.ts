import path from "node:path";
import type { GitWorktreeListEntry, RepoScmSnapshot, RepoStatusEntry } from "@shared/ipc";
import type { GitService } from "@/services/git/gitService";

/** Minimal preload bridge surface used here (Electron renderer); avoids coupling electron `tsc` to `env.d.ts`). */
type WorkspaceApi = {
  gitListWorktrees?: (cwd: string) => Promise<GitWorktreeListEntry[]>;
  gitListBranchesExcludingWorktrees?: (cwd: string) => Promise<string[]>;
  gitCheckoutBranch?: (cwd: string, branch: string) => Promise<void>;
  repoStatus?: (cwd: string) => Promise<RepoScmSnapshot | RepoStatusEntry[]>;
};

function branchFromRepoStatus(raw: RepoScmSnapshot | RepoStatusEntry[]): string {
  if (Array.isArray(raw)) return "";
  return raw.branch?.trim() ?? "";
}

function readWorkspaceApi(): WorkspaceApi | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { workspaceApi?: WorkspaceApi }).workspaceApi;
}

/** Parses `git worktree list --porcelain` (only rows with `refs/heads/`). Used by Electron main (see `diffGitListBranchesExcludingWorktrees`). */
function parseWorktreePorcelain(raw: string): Array<{ path: string; branch: string }> {
  const entries: Array<{ path: string; branch: string }> = [];
  let currentPath = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice("worktree ".length);
    } else if (line.startsWith("branch refs/heads/")) {
      entries.push({ path: currentPath, branch: line.slice("branch refs/heads/".length) });
    }
  }
  return entries;
}

/**
 * Local branch names minus those checked out on another linked worktree. The branch at
 * `cwd` stays. `worktreeListRaw` is `git worktree list --porcelain` text; `localBranches` from
 * `git branch` / `branchLocal().all`. Imported by the main process only.
 */
export function filterLocalBranchesExcludingOtherWorktrees(
  cwd: string,
  localBranches: string[],
  worktreeListRaw: string
): string[] {
  const normalizedCwd = path.resolve(cwd);
  const excluded = new Set(
    parseWorktreePorcelain(worktreeListRaw)
      .filter((e) => path.resolve(e.path) !== normalizedCwd)
      .map((e) => e.branch)
  );
  return localBranches.filter((b) => !excluded.has(b));
}

/**
 * Git operations via the preload `workspaceApi` bridge (Electron IPC).
 */
export class IpcGitService implements GitService {
  constructor(private readonly api: WorkspaceApi | undefined = readWorkspaceApi()) {}

  private requireApi(): WorkspaceApi {
    const a = this.api;
    if (!a) {
      throw new Error("IPC workspace API is not available.");
    }
    return a;
  }

  async listWorktrees(cwd: string): Promise<GitWorktreeListEntry[]> {
    const a = this.requireApi();
    if (!a.gitListWorktrees) {
      throw new Error("workspaceApi.gitListWorktrees is not available.");
    }
    return a.gitListWorktrees(cwd);
  }

  async listBranchesExcludingWorktrees(cwd: string): Promise<string[]> {
    const a = this.requireApi();
    if (!a.gitListBranchesExcludingWorktrees) {
      throw new Error("workspaceApi.gitListBranchesExcludingWorktrees is not available.");
    }
    return a.gitListBranchesExcludingWorktrees(cwd);
  }

  async getCurrentBranch(cwd: string): Promise<string> {
    const a = this.requireApi();
    if (!a.repoStatus) {
      throw new Error("workspaceApi.repoStatus is not available.");
    }
    const raw = await a.repoStatus(cwd);
    return branchFromRepoStatus(raw);
  }

  async checkoutBranch(cwd: string, branch: string): Promise<void> {
    const a = this.requireApi();
    if (!a.gitCheckoutBranch) {
      throw new Error("workspaceApi.gitCheckoutBranch is not available.");
    }
    return a.gitCheckoutBranch(cwd, branch);
  }
}
