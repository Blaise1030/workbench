import { simpleGit } from "simple-git";

export interface RepoWorktree {
  path: string;
  branch: string;
  isCurrent: boolean;
}

export class RepoService {
  async listWorktrees(repoPath: string): Promise<RepoWorktree[]> {
    const git = simpleGit(repoPath);
    const output = await git.raw(["worktree", "list", "--porcelain"]);
    const lines = output.split("\n");
    const results: RepoWorktree[] = [];
    let current: Partial<RepoWorktree> = {};

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        if (current.path && current.branch) {
          results.push(current as RepoWorktree);
        }
        current = { path: line.replace("worktree ", ""), isCurrent: false };
      }
      if (line.startsWith("branch refs/heads/")) {
        current.branch = line.replace("branch refs/heads/", "");
      }
      if (line === "bare") {
        current.isCurrent = false;
      }
    }
    if (current.path && current.branch) {
      results.push(current as RepoWorktree);
    }
    return results;
  }

  async changedFiles(repoPath: string): Promise<string[]> {
    const git = simpleGit(repoPath);
    const status = await git.status();
    return [...status.modified, ...status.created, ...status.deleted, ...status.not_added];
  }
}
