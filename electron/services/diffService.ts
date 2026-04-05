import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import { pathsFromUnifiedDiffSet } from "../../src/shared/diffPaths.js";

const execFileAsync = promisify(execFile);

export class DiffService {
  async changedFiles(cwd: string): Promise<string[]> {
    const git = simpleGit(cwd);
    const status = await git.status();
    return [...status.modified, ...status.created, ...status.deleted, ...status.not_added];
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
    const args = ["-C", cwd, "diff", "-U10", "--no-ext-diff", "--no-index", "--", nullDevice, file];
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

  async fileDiff(cwd: string, file: string): Promise<string> {
    const git = simpleGit(cwd);
    const tracked = await git.diff(["-U10", "--no-ext-diff", "--", file]);
    if (tracked.trim()) return tracked;
    return this.diffNewPathOnDisk(cwd, file);
  }

  /** Full unstaged diff (all changed paths) as one unified diff for multi-file review. */
  async workingTreeDiff(cwd: string): Promise<string> {
    const git = simpleGit(cwd);
    const base = await git.diff(["-U10", "--no-ext-diff"]);
    const changed = await this.changedFiles(cwd);
    const already = pathsFromUnifiedDiffSet(base);
    const missing = changed.filter((p) => !already.has(p));
    const extras = await Promise.all(missing.map((p) => this.diffNewPathOnDisk(cwd, p)));
    return [base, ...extras].filter((c) => c.trim()).join("\n");
  }

  async stageAll(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.add(".");
  }

  async stagePaths(cwd: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const git = simpleGit(cwd);
    await git.add(paths);
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
