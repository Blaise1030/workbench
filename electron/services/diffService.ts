import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";

const execFileAsync = promisify(execFile);

/** `b/<path>` segment from `diff --git` (best-effort; matches normal paths). */
function pathsFromUnifiedDiff(unified: string): Set<string> {
  const out = new Set<string>();
  for (const line of unified.split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    const i = line.lastIndexOf(" b/");
    if (i < 0) continue;
    let p = line.slice(i + 3);
    if (p.startsWith('"')) {
      const end = p.lastIndexOf('"');
      if (end > 0) p = p.slice(1, end);
    }
    out.add(p);
  }
  return out;
}

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
    const already = pathsFromUnifiedDiff(base);
    const missing = changed.filter((p) => !already.has(p));
    const extras = await Promise.all(missing.map((p) => this.diffNewPathOnDisk(cwd, p)));
    return [base, ...extras].filter((c) => c.trim()).join("\n");
  }

  async stageAll(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.add(".");
  }

  async discardAll(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.raw(["reset", "--hard", "HEAD"]);
    await git.clean("f", ["-d"]);
  }
}
