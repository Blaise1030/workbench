import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { simpleGit } from "simple-git";
import type {
  FileDiffScope,
  FileMergeSidesResult,
  RepoChangeKind,
  RepoScmSnapshot,
  RepoStatusEntry
} from "../../src/shared/ipc.js";
import { pathsFromUnifiedDiffSet } from "../../src/shared/diffPaths.js";
import { truncateMergeDoc, truncateUnifiedDiff } from "../../src/shared/diffTruncate.js";

const execFileAsync = promisify(execFile);

function parseNumstatCell(value: string): number | null {
  if (value === "-") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse `git diff --numstat` lines into per-path insert/delete counts. */
function parseNumstat(stdout: string): Map<string, { add: number | null; del: number | null }> {
  const map = new Map<string, { add: number | null; del: number | null }>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const add = parseNumstatCell(parts[0] ?? "");
    const del = parseNumstatCell(parts[1] ?? "");
    let pathField = parts.slice(2).join("\t").trim();
    if (pathField.includes(" => ")) {
      pathField = pathField.split(" => ").pop()?.trim() ?? pathField;
    }
    if (pathField) map.set(pathField, { add, del });
  }
  return map;
}

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

function bufferLooksBinary(buf: Buffer, scanBytes = 65536): boolean {
  const n = Math.min(buf.length, scanBytes);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export class DiffService {
  async isGitRepository(cwd: string): Promise<boolean> {
    try {
      await execFileAsync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
        maxBuffer: 64 * 1024,
        encoding: "utf8"
      });
      return true;
    } catch {
      return false;
    }
  }

  async initGitRepository(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.init();
  }

  async checkoutBranch(cwd: string, branch: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.checkout(branch);
  }

  async repoStatus(cwd: string): Promise<RepoScmSnapshot> {
    const [
      porcelainResult,
      unstagedNumstatResult,
      stagedNumstatResult,
      branchResult,
      lastCommitResult
    ] = await Promise.allSettled([
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

    const unstagedMap =
      unstagedNumstatResult.status === "fulfilled" ? parseNumstat(unstagedNumstatResult.value.stdout) : new Map();
    const stagedMap =
      stagedNumstatResult.status === "fulfilled" ? parseNumstat(stagedNumstatResult.value.stdout) : new Map();

    let branch = "main";
    if (branchResult.status === "fulfilled") {
      branch = branchResult.value.stdout.trim() || branch;
    }

    let lastCommitSubject: string | null = null;
    if (lastCommitResult.status === "fulfilled") {
      const s = lastCommitResult.value.stdout.trim();
      lastCommitSubject = s || null;
    }

    const stdout = porcelainResult.value.stdout;
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
      shortLabel: basename(cwd) || "repo",
      lastCommitSubject
    };
  }

  async changedFiles(cwd: string): Promise<string[]> {
    const { entries } = await this.repoStatus(cwd);
    return entries.map((entry) => entry.path);
  }

  async gitFetch(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.fetch();
  }

  /** Pushes the current branch to its configured upstream (`git push`). */
  async gitPush(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.push();
  }

  async commitStaged(cwd: string, message: string): Promise<void> {
    const git = simpleGit(cwd);
    await git.commit(message);
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

  /**
   * Load blob text from `git show <revSpec>` (UTF-8). Missing rev → empty string.
   * Binary content (NUL in first 64KiB) is reported so the UI can skip merge view.
   */
  private async gitShowBuffer(cwd: string, revSpec: string): Promise<{ text: string; binary: boolean }> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", cwd, "show", revSpec], {
        maxBuffer: 50 * 1024 * 1024,
        encoding: "buffer"
      });
      const buf = stdout as Buffer;
      if (bufferLooksBinary(buf)) return { text: "", binary: true };
      return { text: buf.toString("utf8"), binary: false };
    } catch {
      return { text: "", binary: false };
    }
  }

  /**
   * Two document sides for CodeMirror `MergeView`.
   * - **staged**: `HEAD` (left) vs index (right) — same basis as `git diff --cached`.
   * - **unstaged**: index (left) vs working tree (right) — same basis as `git diff`.
   */
  async fileMergeSides(
    cwd: string,
    file: string,
    scope: Exclude<FileDiffScope, "combined">
  ): Promise<FileMergeSidesResult> {
    if (scope === "staged") {
      const head = await this.gitShowBuffer(cwd, `HEAD:${file}`);
      const index = await this.gitShowBuffer(cwd, `:${file}`);
      if (head.binary || index.binary) return { kind: "binary" };
      return {
        kind: "ok",
        original: truncateMergeDoc(head.text),
        modified: truncateMergeDoc(index.text),
        originalLabel: "HEAD",
        modifiedLabel: "Staged"
      };
    }

    const index = await this.gitShowBuffer(cwd, `:${file}`);
    let wtText = "";
    let wtBinary = false;
    const abs = resolve(cwd, file);
    try {
      if (statSync(abs).isFile()) {
        const buf = readFileSync(abs);
        if (bufferLooksBinary(buf)) wtBinary = true;
        else wtText = buf.toString("utf8");
      }
    } catch {
      wtText = "";
    }
    if (index.binary || wtBinary) return { kind: "binary" };
    return {
      kind: "ok",
      original: truncateMergeDoc(index.text),
      modified: truncateMergeDoc(wtText),
      originalLabel: "Staged",
      modifiedLabel: "Working tree"
    };
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
    // Filter out paths that are ignored by .gitignore
    let stageable = paths;
    try {
      const result = await git.raw(["check-ignore", "--", ...paths]);
      const ignored = new Set(result.split("\n").map((p) => p.trim()).filter(Boolean));
      stageable = paths.filter((p) => !ignored.has(p));
    } catch {
      // check-ignore exits non-zero when no paths are ignored — that's fine
    }
    if (stageable.length === 0) return;
    await git.add(stageable);
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

  /** Absolute path to the `HEAD` ref file for this worktree (suitable for `fs.watch`). */
  async resolveGitHeadFilePath(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", cwd, "rev-parse", "--git-dir"], {
        maxBuffer: 64 * 1024,
        encoding: "utf8"
      });
      const gitDir = resolve(cwd, stdout.trim());
      return resolve(gitDir, "HEAD");
    } catch {
      return null;
    }
  }

  async readAbbrevRefHead(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
        maxBuffer: 64 * 1024,
        encoding: "utf8"
      });
      const branch = stdout.trim();
      return branch || null;
    } catch {
      return null;
    }
  }
}
