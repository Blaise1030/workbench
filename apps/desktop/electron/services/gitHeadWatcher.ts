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
 * Watches each worktree's `HEAD` so branch changes from an external terminal (or other tools)
 * still refresh SCM state and persisted worktree branch names.
 */
export class GitHeadWatcher {
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly pendingAttach = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCwds = new Set<string>();

  constructor(private readonly opts: GitHeadWatcherOptions) {}

  syncFromSnapshot(snapshot: WorkspaceSnapshot): void {
    const desired = new Set(snapshot.worktrees.map((w) => path.normalize(w.path)));

    for (const cwd of this.watchers.keys()) {
      if (!desired.has(cwd)) {
        this.watchers.get(cwd)?.close();
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
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
    this.pendingAttach.clear();
  }

  private async attach(cwd: string): Promise<void> {
    const normalized = path.normalize(cwd);
    this.pendingAttach.add(normalized);
    try {
      const headPath = await this.opts.diffService.resolveGitHeadFilePath(normalized);
      if (!headPath || this.watchers.has(normalized)) return;

      const watcher = fs.watch(headPath, () => {
        this.scheduleRefresh(normalized);
      });
      watcher.on("error", () => {
        watcher.close();
        this.watchers.delete(normalized);
      });
      this.watchers.set(normalized, watcher);
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
