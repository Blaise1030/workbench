import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import type { GitAdapter } from "./workspaceService.js";

/** Validates that a branch name cannot be interpreted as a git flag. */
export function isValidBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\-\/]+$/.test(name) && !name.startsWith("-");
}

function assertValidBranch(branch: string): void {
  if (!isValidBranchName(branch)) {
    throw new Error(`Invalid branch name: "${branch}"`);
  }
}

export function createGitAdapter(): GitAdapter {
  return {
    async worktreeAdd(repoPath, worktreePath, branch, baseBranch) {
      assertValidBranch(branch);
      if (baseBranch) assertValidBranch(baseBranch);
      const git = simpleGit(repoPath);
      if (baseBranch) {
        // branch comes before --, path args come after --
        await git.raw(["worktree", "add", "-b", branch, "--", worktreePath, baseBranch]);
      } else {
        await git.raw(["worktree", "add", "--", worktreePath, branch]);
      }
    },

    async worktreeRemove(worktreePath) {
      // Use path.dirname instead of fragile regex
      const parent = path.dirname(path.resolve(worktreePath));
      const git = simpleGit(parent);
      await git.raw(["worktree", "remove", "--force", "--", worktreePath]);
    },

    async worktreeList(repoPath) {
      const git = simpleGit(repoPath);
      const raw = await git.raw(["worktree", "list", "--porcelain"]);
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
    },

    async branchList(repoPath) {
      const git = simpleGit(repoPath);
      const result = await git.branchLocal();
      return result.all;
    },

    async pathExists(fsPath) {
      return fs.existsSync(fsPath);
    }
  };
}
