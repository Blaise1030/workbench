import { defineStore } from "pinia";
import type { Project, Thread, ThreadSession, Worktree } from "@shared/domain";

export interface WorkspaceThreadContext {
  worktreeId: string;
  worktree: Worktree;
  displayLabel: string;
  isDefault: boolean;
  threads: Thread[];
}

export interface WorkspaceContextBadge {
  worktreeId: string;
  displayLabel: string;
  isDefault: boolean;
  threadCount: number;
}

/**
 * Human-readable checkout context: checked-out branch and worktree name.
 * When branch and name are the same (typical for primary), a single segment is shown.
 */
export function worktreeBranchNameContextLabel(worktree: Worktree): string {
  const branch = worktree.branch?.trim() ?? "";
  const name = worktree.name?.trim() ?? "";
  if (!branch && !name) {
    return worktree.isDefault ? "Primary" : "";
  }
  if (!branch) return name;
  if (!name) return branch;
  if (branch === name) return branch;
  return `${branch} · ${name}`;
}

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    projects: [] as Project[],
    worktrees: [] as Worktree[],
    threads: [] as Thread[],
    threadSessions: [] as ThreadSession[]
  }),
  getters: {
    /** Look up the persisted session record for a thread by its ID. */
    threadSessionFor: (state) => (threadId: string): ThreadSession | undefined =>
      state.threadSessions?.find((s) => s.threadId === threadId)
  },
  actions: {
    hydrate(snapshot: {
      projects: Project[];
      worktrees: Worktree[];
      threads: Thread[];
      threadSessions: ThreadSession[];
      activeProjectId: string | null;
      activeWorktreeId: string | null;
      activeThreadId: string | null;
    }): {
      activeProjectId: string | null;
      activeWorktreeId: string | null;
      activeThreadId: string | null;
    } {
      this.projects = snapshot.projects;
      this.worktrees = snapshot.worktrees;
      this.threads = snapshot.threads;
      this.threadSessions = snapshot.threadSessions ?? [];
      return {
        activeProjectId: snapshot.activeProjectId,
        activeWorktreeId: snapshot.activeWorktreeId,
        activeThreadId: snapshot.activeThreadId
      };
    },
    /** Immediate UI update; call refreshSnapshot after IPC so server state wins. */
    removeThreadLocal(threadId: string): void {
      this.threads = this.threads.filter((t) => t.id !== threadId);
    }
  }
});
