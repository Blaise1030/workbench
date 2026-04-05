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
    }
  }
});
