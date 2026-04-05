"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffService = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const simple_git_1 = require("simple-git");
const diffPaths_js_1 = require("../../src/shared/diffPaths.js");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
class DiffService {
    async changedFiles(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        const status = await git.status();
        return [...status.modified, ...status.created, ...status.deleted, ...status.not_added];
    }
    /**
     * Untracked / intent-to-add paths are omitted from plain `git diff`.
     * `git diff --no-index` exits 1 when there are changes; Node treats that as an error but still returns stdout.
     */
    async diffNewPathOnDisk(cwd, file) {
        const abs = (0, node_path_1.resolve)(cwd, file);
        try {
            if (!(0, node_fs_1.statSync)(abs).isFile())
                return "";
        }
        catch {
            return "";
        }
        const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
        const args = ["-C", cwd, "diff", "-U10", "--no-ext-diff", "--no-index", "--", nullDevice, file];
        try {
            const { stdout } = await execFileAsync("git", args, {
                maxBuffer: 10 * 1024 * 1024,
                encoding: "utf8"
            });
            return stdout;
        }
        catch (err) {
            const e = err;
            if (e.code === 1 && typeof e.stdout === "string")
                return e.stdout;
            return "";
        }
    }
    async fileDiff(cwd, file) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        const tracked = await git.diff(["-U10", "--no-ext-diff", "--", file]);
        if (tracked.trim())
            return tracked;
        return this.diffNewPathOnDisk(cwd, file);
    }
    /** Full unstaged diff (all changed paths) as one unified diff for multi-file review. */
    async workingTreeDiff(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        const base = await git.diff(["-U10", "--no-ext-diff"]);
        const changed = await this.changedFiles(cwd);
        const already = (0, diffPaths_js_1.pathsFromUnifiedDiffSet)(base);
        const missing = changed.filter((p) => !already.has(p));
        const extras = await Promise.all(missing.map((p) => this.diffNewPathOnDisk(cwd, p)));
        return [base, ...extras].filter((c) => c.trim()).join("\n");
    }
    async stageAll(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.add(".");
    }
    async stagePaths(cwd, paths) {
        if (paths.length === 0)
            return;
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.add(paths);
    }
    /**
     * Restore selected paths to HEAD (index + worktree) and remove untracked paths from disk.
     * Matches per-file semantics of a full discard for the chosen paths only.
     */
    async discardPaths(cwd, paths) {
        if (paths.length === 0)
            return;
        const unique = [...new Set(paths)];
        const { stdout } = await execFileAsync("git", ["-C", cwd, "ls-files", "-z", "--cached", "--", ...unique], {
            maxBuffer: 10 * 1024 * 1024,
            encoding: "utf8"
        });
        const tracked = new Set(stdout.split("\0").filter(Boolean));
        const toRestore = unique.filter((p) => tracked.has(p));
        const toClean = unique.filter((p) => !tracked.has(p));
        const git = (0, simple_git_1.simpleGit)(cwd);
        if (toRestore.length > 0) {
            await git.raw(["restore", "--source=HEAD", "--staged", "--worktree", "--", ...toRestore]);
        }
        if (toClean.length > 0) {
            await git.clean("f", ["-d", "--", ...toClean]);
        }
    }
    async discardAll(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.raw(["reset", "--hard", "HEAD"]);
        await git.clean("f", ["-d"]);
    }
}
exports.DiffService = DiffService;
