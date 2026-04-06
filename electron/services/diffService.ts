import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import type { FileDiffScope, RepoChangeKind, RepoStatusEntry } from "../../src/shared/ipc.js";
import { pathsFromUnifiedDiffSet } from "../../src/shared/diffPaths.js";
import { truncateUnifiedDiff } from "../../src/shared/diffTruncate.js";

const execFileAsync = promisify(execFile);

function decodeStatusKind(code: string): RepoChangeKind | null {
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

export class DiffService {
  async repoStatus(cwd: string): Promise<RepoStatusEntry[]> {
    const { stdout } = await execFileAsync("git", ["-C", cwd, "status", "--porcelain=v1", "-z"], {
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8"
    });
    const tokens = stdout.split("\0");
    const entries: RepoStatusEntry[] = [];

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token) continue;
      const xy = token.slice(0, 2);
      const path = token.slice(3);
      const stagedCode = xy[0] ?? " ";
      const unstagedCode = xy[1] ?? " ";
      const stagedKind = decodeStatusKind(stagedCode);
      const unstagedKind = decodeStatusKind(unstagedCode);
      const isRename = stagedCode === "R" || stagedCode === "C";
      const originalPath = isRename ? tokens[i + 1] || null : null;

      if (isRename) i += 1;

      entries.push({
        path,
        originalPath,
        stagedKind,
        unstagedKind,
        isUntracked: xy === "??"
      });
    }

    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  async changedFiles(cwd: string): Promise<string[]> {
    const status = await this.repoStatus(cwd);
    return status.map((entry) => entry.path);
  }

  /**
   * Untracked / intent-to-add paths are omitted from plain `git diff`.
   * `git diff --no-index` exits 1 when there are changes; Node treats that as an error but still returns stdout.
   */
  private async diffNewPathOnDisk(cwd: string, file: string): Promise<string> {
    const abs = resolve(cwd, file);
    try {
      if (!statSync(abs).isFile()) return "";
    } catch {
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
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string };
      if (e.code === 1 && typeof e.stdout === "string") return e.stdout;
      return "";
    }
  }

  async fileDiff(cwd: string, file: string, scope: FileDiffScope = "unstaged"): Promise<string> {
    const git = simpleGit(cwd);
    if (scope === "staged") {
      return truncateUnifiedDiff(await git.diff(["--cached", "-U3", "--no-ext-diff", "--", file]));
    }

    const unstagedTracked = await git.diff(["-U3", "--no-ext-diff", "--", file]);
    const unstaged = unstagedTracked.trim() ? unstagedTracked : await this.diffNewPathOnDisk(cwd, file);
    if (scope === "combined") {
      const staged = await git.diff(["--cached", "-U3", "--no-ext-diff", "--", file]);
      return truncateUnifiedDiff([staged, unstaged].filter((chunk) => chunk.trim()).join("\n"));
    }
    return truncateUnifiedDiff(unstaged);
  }

  /** Full unstaged diff (all changed paths) as one unified diff for multi-file review. */
  async workingTreeDiff(cwd: string): Promise<string> {
    const git = simpleGit(cwd);
    const base = await git.diff(["-U3", "--no-ext-diff"]);
    const changed = await this.changedFiles(cwd);
    const already = pathsFromUnifiedDiffSet(base);
    const missing = changed.filter((p) => !already.has(p));
    const extras = await Promise.all(missing.map((p) => this.diffNewPathOnDisk(cwd, p)));
    return truncateUnifiedDiff([base, ...extras].filter((c) => c.trim()).join("\n"));
  }

  async stageAll(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.add(".");
  }

  async unstageAll(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.raw(["restore", "--staged", "."]);
  }

  async stagePaths(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const git = simpleGit(cwd);
    await git.add(paths);
  }

  async unstagePaths(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const git = simpleGit(cwd);
    await git.raw(["restore", "--staged", "--", ...paths]);
  }

  /**
   * Restore selected paths to HEAD (index + worktree) and remove untracked paths from disk.
   * Matches per-file semantics of a full discard for the chosen paths only.
   */
  async discardPaths(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const unique = [...new Set(paths)];
    const { stdout } = await execFileAsync("git", ["-C", cwd, "ls-files", "-z", "--cached", "--", ...unique], {
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8"
    });
    const tracked = new Set(stdout.split("\0").filter(Boolean));
    const toRestore = unique.filter((p) => tracked.has(p));
    const toClean = unique.filter((p) => !tracked.has(p));
    const git = simpleGit(cwd);
    if (toRestore.length > 0) {
      await git.raw(["restore", "--source=HEAD", "--staged", "--worktree", "--", ...toRestore]);
    }
    if (toClean.length > 0) {
      await git.clean("f", ["-d", "--", ...toClean]);
    }
  }

  async discardAll(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.raw(["reset", "--hard", "HEAD"]);
    await git.clean("f", ["-d"]);
  }
}
