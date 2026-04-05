"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffService = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const simple_git_1 = require("simple-git");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
/** `b/<path>` segment from `diff --git` (best-effort; matches normal paths). */
function pathsFromUnifiedDiff(unified) {
    const out = new Set();
    for (const line of unified.split("\n")) {
        if (!line.startsWith("diff --git "))
            continue;
        const i = line.lastIndexOf(" b/");
        if (i < 0)
            continue;
        let p = line.slice(i + 3);
        if (p.startsWith('"')) {
            const end = p.lastIndexOf('"');
            if (end > 0)
                p = p.slice(1, end);
        }
        out.add(p);
    }
    return out;
}
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
        const already = pathsFromUnifiedDiff(base);
        const missing = changed.filter((p) => !already.has(p));
        const extras = await Promise.all(missing.map((p) => this.diffNewPathOnDisk(cwd, p)));
        return [base, ...extras].filter((c) => c.trim()).join("\n");
    }
    async stageAll(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.add(".");
    }
    async discardAll(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.raw(["reset", "--hard", "HEAD"]);
        await git.clean("f", ["-d"]);
    }
}
exports.DiffService = DiffService;
