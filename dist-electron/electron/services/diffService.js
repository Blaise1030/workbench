"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffService = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const simple_git_1 = require("simple-git");
const diffPaths_js_1 = require("../../src/shared/diffPaths.js");
const diffTruncate_js_1 = require("../../src/shared/diffTruncate.js");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function parseNumstatCell(value) {
    if (value === "-")
        return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}
/** Parse `git diff --numstat` lines into per-path insert/delete counts. */
function parseNumstat(stdout) {
    const map = new Map();
    for (const line of stdout.split("\n")) {
        if (!line.trim())
            continue;
        const parts = line.split("\t");
        if (parts.length < 3)
            continue;
        const add = parseNumstatCell(parts[0] ?? "");
        const del = parseNumstatCell(parts[1] ?? "");
        let pathField = parts.slice(2).join("\t").trim();
        if (pathField.includes(" => ")) {
            pathField = pathField.split(" => ").pop()?.trim() ?? pathField;
        }
        if (pathField)
            map.set(pathField, { add, del });
    }
    return map;
}
function decodeStatusKind(code) {
    switch (code) {
        case "M":
            return "modified";
        case "A":
            return "added";
        case "D":
            return "deleted";
        case "R":
            return "renamed";
        case "C":
            return "copied";
        case "U":
            return "unmerged";
        case "?":
            return "untracked";
        default:
            return null;
    }
}
class DiffService {
    async isGitRepository(cwd) {
        try {
            await execFileAsync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
                maxBuffer: 64 * 1024,
                encoding: "utf8"
            });
            return true;
        }
        catch {
            return false;
        }
    }
    async initGitRepository(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.init();
    }
    async repoStatus(cwd) {
        const [porcelainResult, unstagedNumstatResult, stagedNumstatResult, branchResult, lastCommitResult] = await Promise.allSettled([
            execFileAsync("git", ["-C", cwd, "status", "--porcelain=v1", "-z"], {
                maxBuffer: 10 * 1024 * 1024,
                encoding: "utf8"
            }),
            execFileAsync("git", ["-C", cwd, "diff", "--numstat"], {
                maxBuffer: 10 * 1024 * 1024,
                encoding: "utf8"
            }),
            execFileAsync("git", ["-C", cwd, "diff", "--cached", "--numstat"], {
                maxBuffer: 10 * 1024 * 1024,
                encoding: "utf8"
            }),
            execFileAsync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
                maxBuffer: 64 * 1024,
                encoding: "utf8"
            }),
            execFileAsync("git", ["-C", cwd, "log", "-1", "--pretty=%s"], {
                maxBuffer: 64 * 1024,
                encoding: "utf8"
            })
        ]);
        if (porcelainResult.status === "rejected") {
            throw porcelainResult.reason;
        }
        const unstagedMap = unstagedNumstatResult.status === "fulfilled" ? parseNumstat(unstagedNumstatResult.value.stdout) : new Map();
        const stagedMap = stagedNumstatResult.status === "fulfilled" ? parseNumstat(stagedNumstatResult.value.stdout) : new Map();
        let branch = "main";
        if (branchResult.status === "fulfilled") {
            branch = branchResult.value.stdout.trim() || branch;
        }
        let lastCommitSubject = null;
        if (lastCommitResult.status === "fulfilled") {
            const s = lastCommitResult.value.stdout.trim();
            lastCommitSubject = s || null;
        }
        const stdout = porcelainResult.value.stdout;
        const tokens = stdout.split("\0");
        const entries = [];
        for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i];
            if (!token)
                continue;
            const xy = token.slice(0, 2);
            const path = token.slice(3);
            const stagedCode = xy[0] ?? " ";
            const unstagedCode = xy[1] ?? " ";
            const stagedKind = decodeStatusKind(stagedCode);
            const unstagedKind = decodeStatusKind(unstagedCode);
            const isRename = stagedCode === "R" || stagedCode === "C";
            const originalPath = isRename ? tokens[i + 1] || null : null;
            if (isRename)
                i += 1;
            const u = unstagedMap.get(path);
            const s = stagedMap.get(path);
            entries.push({
                path,
                originalPath,
                stagedKind,
                unstagedKind,
                isUntracked: xy === "??",
                stagedLinesAdded: s?.add ?? null,
                stagedLinesRemoved: s?.del ?? null,
                unstagedLinesAdded: u?.add ?? null,
                unstagedLinesRemoved: u?.del ?? null
            });
        }
        entries.sort((a, b) => a.path.localeCompare(b.path));
        return {
            entries,
            branch,
            shortLabel: (0, node_path_1.basename)(cwd) || "repo",
            lastCommitSubject
        };
    }
    async changedFiles(cwd) {
        const { entries } = await this.repoStatus(cwd);
        return entries.map((entry) => entry.path);
    }
    async gitFetch(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.fetch();
    }
    /** Pushes the current branch to its configured upstream (`git push`). */
    async gitPush(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.push();
    }
    async commitStaged(cwd, message) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.commit(message);
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
        const args = ["-C", cwd, "diff", "-U3", "--no-ext-diff", "--no-index", "--", nullDevice, file];
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
    async fileDiff(cwd, file, scope = "unstaged") {
        const git = (0, simple_git_1.simpleGit)(cwd);
        if (scope === "staged") {
            return (0, diffTruncate_js_1.truncateUnifiedDiff)(await git.diff(["--cached", "-U3", "--no-ext-diff", "--", file]));
        }
        const unstagedTracked = await git.diff(["-U3", "--no-ext-diff", "--", file]);
        const unstaged = unstagedTracked.trim() ? unstagedTracked : await this.diffNewPathOnDisk(cwd, file);
        if (scope === "combined") {
            const staged = await git.diff(["--cached", "-U3", "--no-ext-diff", "--", file]);
            return (0, diffTruncate_js_1.truncateUnifiedDiff)([staged, unstaged].filter((chunk) => chunk.trim()).join("\n"));
        }
        return (0, diffTruncate_js_1.truncateUnifiedDiff)(unstaged);
    }
    /** Full unstaged diff (all changed paths) as one unified diff for multi-file review. */
    async workingTreeDiff(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        const base = await git.diff(["-U3", "--no-ext-diff"]);
        const changed = await this.changedFiles(cwd);
        const already = (0, diffPaths_js_1.pathsFromUnifiedDiffSet)(base);
        const missing = changed.filter((p) => !already.has(p));
        const extras = await Promise.all(missing.map((p) => this.diffNewPathOnDisk(cwd, p)));
        return (0, diffTruncate_js_1.truncateUnifiedDiff)([base, ...extras].filter((c) => c.trim()).join("\n"));
    }
    async stageAll(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.add(".");
    }
    async unstageAll(cwd) {
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.raw(["restore", "--staged", "."]);
    }
    async stagePaths(cwd, paths) {
        if (paths.length === 0)
            return;
        const git = (0, simple_git_1.simpleGit)(cwd);
        // Filter out paths that are ignored by .gitignore
        let stageable = paths;
        try {
            const result = await git.raw(["check-ignore", "--", ...paths]);
            const ignored = new Set(result.split("\n").map((p) => p.trim()).filter(Boolean));
            stageable = paths.filter((p) => !ignored.has(p));
        }
        catch {
            // check-ignore exits non-zero when no paths are ignored — that's fine
        }
        if (stageable.length === 0)
            return;
        await git.add(stageable);
    }
    async unstagePaths(cwd, paths) {
        if (paths.length === 0)
            return;
        const git = (0, simple_git_1.simpleGit)(cwd);
        await git.raw(["restore", "--staged", "--", ...paths]);
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
