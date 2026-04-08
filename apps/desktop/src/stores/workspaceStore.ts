import { defineStore } from "pinia";
import type { Project, Thread, Worktree } from "@shared/domain";

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

function getActiveProjectWorktrees(state: {
  worktrees: Worktree[];
  activeProjectId: string | null;
}): Worktree[] {
  return state.worktrees.filter((worktree) => worktree.projectId === state.activeProjectId);
}

function orderProjectWorktrees(worktrees: Worktree[]): Worktree[] {
  const defaultWorktree = worktrees.find((worktree) => worktree.isDefault);
  const linkedWorktrees = worktrees.filter((worktree) => !worktree.isDefault);
  return defaultWorktree ? [defaultWorktree, ...linkedWorktrees] : linkedWorktrees;
}

function worktreeDisplayLabel(worktree: Worktree): string {
  return worktree.isDefault ? "Primary" : worktree.name;
}

function threadsForWorktree(threads: Thread[], worktreeId: string): Thread[] {
  return threads.filter((thread) => thread.worktreeId === worktreeId);
}

function buildThreadContexts(state: {
  worktrees: Worktree[];
  threads: Thread[];
  activeProjectId: string | null;
}): WorkspaceThreadContext[] {
  return orderProjectWorktrees(getActiveProjectWorktrees(state)).map((worktree) => ({
    worktreeId: worktree.id,
    worktree,
    displayLabel: worktreeDisplayLabel(worktree),
    isDefault: worktree.isDefault,
    threads: threadsForWorktree(state.threads, worktree.id)
  }));
}

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

    /** Contexts for the active project, ordered with the default worktree first. */
    threadContexts(state): WorkspaceThreadContext[] {
      return buildThreadContexts(state);
    },

    /** Active worktree metadata for a compact badge in the layout or header. */
    activeContextBadge(state): WorkspaceContextBadge | null {
      const activeWorktree = state.worktrees.find((w) => w.id === state.activeWorktreeId);
      if (!activeWorktree || activeWorktree.projectId !== state.activeProjectId) {
        return null;
      }

      return {
        worktreeId: activeWorktree.id,
        displayLabel: worktreeDisplayLabel(activeWorktree),
        isDefault: activeWorktree.isDefault,
        threadCount: threadsForWorktree(state.threads, activeWorktree.id).length
      };
    },

    /** All threads belonging to any worktree in the active project. */
    activeProjectThreads(state): Thread[] {
      const projectWorktreeIds = new Set(
        state.worktrees
          .filter((w) => w.projectId === state.activeProjectId)
          .map((w) => w.id)
      );
      return state.threads.filter((t) => projectWorktreeIds.has(t.worktreeId));
    },

    /** The default worktree for the active project (main checkout). */
    defaultWorktree(state): Worktree | undefined {
      return state.worktrees.find(
        (w) => w.projectId === state.activeProjectId && w.isDefault
      );
    },

    /** Non-default worktrees for the active project (thread groups). */
    threadGroups(state): Worktree[] {
      return buildThreadContexts(state)
        .filter((context) => !context.isDefault)
        .map((context) => context.worktree);
    },

    /** Threads in the default worktree (ungrouped). */
    ungroupedThreads(state): Thread[] {
      return buildThreadContexts(state).find((context) => context.isDefault)?.threads ?? [];
    },

    /** Threads grouped by worktree id for the active project. */
    groupedThreadsByWorktree(state): Map<string, Thread[]> {
      const groups = new Map<string, Thread[]>();
      for (const context of buildThreadContexts(state)) {
        if (context.isDefault) continue;
        groups.set(context.worktreeId, context.threads);
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
