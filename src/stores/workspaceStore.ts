import { defineStore } from "pinia";
import type { Project, Thread, Worktree } from "@shared/domain";

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    projects: [] as Project[],
    worktrees: [] as Worktree[],
    threads: [] as Thread[],
    activeProjectId: null as string | null,
    activeWorktreeId: null as string | null,
    activeThreadId: null as string | null
  }),
  getters: {
    activeProject(state): Project | undefined {
      return state.projects.find((p) => p.id === state.activeProjectId);
    },
    activeWorktree(state): Worktree | undefined {
      return state.worktrees.find((w) => w.id === state.activeWorktreeId);
    },
    activeThreads(state): Thread[] {
      return state.threads.filter((t) => t.worktreeId === state.activeWorktreeId);
    },

    /** The default worktree for the active project (main checkout). */
    defaultWorktree(state): Worktree | undefined {
      return state.worktrees.find(
        (w) => w.projectId === state.activeProjectId && w.isDefault
      );
    },

    /** Non-default worktrees for the active project (thread groups). */
    threadGroups(state): Worktree[] {
      return state.worktrees.filter(
        (w) => w.projectId === state.activeProjectId && !w.isDefault
      );
    },

    /** Threads in the default worktree (ungrouped). */
    ungroupedThreads(state): Thread[] {
      const defaultWt = state.worktrees.find(
        (w) => w.projectId === state.activeProjectId && w.isDefault
      );
      if (!defaultWt) return [];
      return state.threads.filter((t) => t.worktreeId === defaultWt.id);
    },

    /** Threads grouped by non-default worktree id. */
    groupedThreadsByWorktree(state): Map<string, Thread[]> {
      const groups = new Map<string, Thread[]>();
      const nonDefault = state.worktrees.filter(
        (w) => w.projectId === state.activeProjectId && !w.isDefault
      );
      for (const wt of nonDefault) {
        groups.set(
          wt.id,
          state.threads.filter((t) => t.worktreeId === wt.id)
        );
      }
      return groups;
    }
  },
  actions: {
    hydrate(snapshot: {
      projects: Project[];
      worktrees: Worktree[];
      threads: Thread[];
      activeProjectId: string | null;
      activeWorktreeId: string | null;
      activeThreadId: string | null;
    }) {
      this.projects = snapshot.projects;
      this.worktrees = snapshot.worktrees;
      this.threads = snapshot.threads;
      this.activeProjectId = snapshot.activeProjectId;
      this.activeWorktreeId = snapshot.activeWorktreeId;
      this.activeThreadId = snapshot.activeThreadId;
    },
    setActiveThread(threadId: string): void {
      this.activeThreadId = threadId;
    },
    /** Immediate UI update; call refreshSnapshot after IPC so server state wins. */
    reorderThreadsLocal(worktreeId: string, orderedThreadIds: string[]): void {
      const orderedThreads = orderedThreadIds
        .map((threadId) =>
          this.threads.find((thread) => thread.worktreeId === worktreeId && thread.id === threadId)
        )
        .filter((thread): thread is Thread => thread !== undefined);
      let nextOrderedIndex = 0;

      this.threads = this.threads.map((thread) => {
        if (thread.worktreeId !== worktreeId) return thread;
        const nextThread = orderedThreads[nextOrderedIndex];
        nextOrderedIndex += 1;
        return nextThread ?? thread;
      });
    },
    /** Immediate UI update; call refreshSnapshot after IPC so server state wins. */
    removeThreadLocal(threadId: string): void {
      const wasActive = this.activeThreadId === threadId;
      this.threads = this.threads.filter((t) => t.id !== threadId);
      if (wasActive) {
        this.activeThreadId =
          this.threads.find((t) => t.worktreeId === this.activeWorktreeId)?.id ?? null;
      }
    }
  }
});
