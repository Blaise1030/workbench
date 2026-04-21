import fs from "node:fs";
import path from "node:path";
import type { DiffService } from "./diffService.js";
import type { WorkspaceService } from "./workspaceService.js";
import type { WorkspaceSnapshot } from "../../src/shared/ipc.js";

export interface GitHeadWatcherOptions {
  diffService: DiffService;
  workspaceService: WorkspaceService;
  /** Refresh git UI (status, diffs) in the renderer. */
  onWorkingTreeChanged: () => void;
  /** Persisted worktrees / sidebar labels may need re-hydration when `branch` was updated. */
  onWorkspaceMetadataChanged: () => void;
}

/**
 * Watches each worktree's `HEAD` and `index` so branch changes and staging operations
 * from an external terminal (or other tools) still refresh SCM state and persisted
 * worktree branch names.
 */
export class GitHeadWatcher {
  private readonly watchers = new Map<string, fs.FSWatcher[]>();
  private readonly pendingAttach = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCwds = new Set<string>();

  constructor(private readonly opts: GitHeadWatcherOptions) {}

  syncFromSnapshot(snapshot: WorkspaceSnapshot): void {
    const desired = new Set(snapshot.worktrees.map((w) => path.normalize(w.path)));

    for (const cwd of this.watchers.keys()) {
      if (!desired.has(cwd)) {
        for (const w of this.watchers.get(cwd) ?? []) w.close();
        this.watchers.delete(cwd);
      }
    }

    for (const cwd of desired) {
      if (this.watchers.has(cwd) || this.pendingAttach.has(cwd)) continue;
      void this.attach(cwd);
    }
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingCwds.clear();
    for (const ws of this.watchers.values()) {
      for (const w of ws) w.close();
    }
    this.watchers.clear();
    this.pendingAttach.clear();
  }

  private async attach(cwd: string): Promise<void> {
    const normalized = path.normalize(cwd);
    this.pendingAttach.add(normalized);
    try {
      const paths = await this.opts.diffService.resolveGitWatchPaths(normalized);
      if (!paths || this.watchers.has(normalized)) return;

      const cwdWatchers: fs.FSWatcher[] = [];
      const onError = (): void => {
        for (const w of cwdWatchers) {
          try { w.close(); } catch { /* ignore */ }
        }
        this.watchers.delete(normalized);
      };

      for (const watchPath of [paths.headPath, paths.indexPath]) {
        const watcher = fs.watch(watchPath, () => {
          this.scheduleRefresh(normalized);
        });
        watcher.on("error", onError);
        cwdWatchers.push(watcher);
      }

      this.watchers.set(normalized, cwdWatchers);
    } catch {
      /* not a git worktree or unreadable */
    } finally {
      this.pendingAttach.delete(normalized);
    }
  }

  private scheduleRefresh(cwd: string): void {
    this.pendingCwds.add(cwd);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flushPending(), 120);
  }

  private async flushPending(): Promise<void> {
    this.debounceTimer = null;
    const cwds = [...this.pendingCwds];
    this.pendingCwds.clear();
    if (cwds.length === 0) return;

    let storeUpdated = false;
    for (const cwd of cwds) {
      const branch = await this.opts.diffService.readAbbrevRefHead(cwd);
      if (!branch) continue;
      if (this.opts.workspaceService.updateWorktreeBranchAtPath(cwd, branch)) {
        storeUpdated = true;
      }
    }

    this.opts.onWorkingTreeChanged();
    if (storeUpdated) this.opts.onWorkspaceMetadataChanged();
  }
}
