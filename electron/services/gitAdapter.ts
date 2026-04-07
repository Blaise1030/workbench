import fs from "node:fs";
import { simpleGit } from "simple-git";
import type { GitAdapter } from "./workspaceService.js";

export function createGitAdapter(): GitAdapter {
  return {
    async worktreeAdd(repoPath, worktreePath, branch, baseBranch) {
      const git = simpleGit(repoPath);
      if (baseBranch) {
        await git.raw(["worktree", "add", "-b", branch, worktreePath, baseBranch]);
      } else {
        await git.raw(["worktree", "add", worktreePath, branch]);
      }
    },

    async worktreeRemove(worktreePath) {
      const parent = worktreePath.replace(/\/[^/]+\/?$/, "");
      const git = simpleGit(parent);
      await git.raw(["worktree", "remove", worktreePath, "--force"]);
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
