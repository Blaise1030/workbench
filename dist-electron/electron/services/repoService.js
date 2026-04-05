"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepoService = void 0;
const simple_git_1 = require("simple-git");
class RepoService {
    async listWorktrees(repoPath) {
        const git = (0, simple_git_1.simpleGit)(repoPath);
        const output = await git.raw(["worktree", "list", "--porcelain"]);
        const lines = output.split("\n");
        const results = [];
        let current = {};
        for (const line of lines) {
            if (line.startsWith("worktree ")) {
                if (current.path && current.branch) {
                    results.push(current);
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
            results.push(current);
        }
        return results;
    }
    async changedFiles(repoPath) {
        const git = (0, simple_git_1.simpleGit)(repoPath);
        const status = await git.status();
        return [...status.modified, ...status.created, ...status.deleted, ...status.not_added];
    }
}
exports.RepoService = RepoService;
