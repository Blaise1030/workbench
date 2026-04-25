import { computed } from "vue";
import { useRoute } from "vue-router";
import { decodeBranch } from "@/router/branchParam";
import {
  worktreeBranchNameContextLabel,
  type WorkspaceContextBadge,
  type WorkspaceThreadContext
} from "@/stores/workspaceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Thread, Worktree } from "@shared/domain";

function worktreeDisplayLabel(worktree: Worktree): string {
  const combined = worktreeBranchNameContextLabel(worktree);
  if (combined.length > 0) return combined;
  if (worktree.isDefault) return "Primary";
  return worktree.name?.trim() || "Worktree";
}

function compareThreadSort(a: Thread, b: Thread): number {
  const byCreated = b.createdAt.localeCompare(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

function getActiveProjectWorktrees(
  worktrees: Worktree[],
  activeProjectId: string | null
): Worktree[] {
  if (!activeProjectId) return [];
  return worktrees.filter((w) => w.projectId === activeProjectId);
}

function orderProjectWorktrees(worktrees: Worktree[]): Worktree[] {
  const defaultWorktree = worktrees.find((w) => w.isDefault);
  const linkedWorktrees = worktrees.filter((w) => !w.isDefault);
  return defaultWorktree ? [defaultWorktree, ...linkedWorktrees] : linkedWorktrees;
}

function threadsForWorktree(threads: Thread[], worktreeId: string): Thread[] {
  return threads
    .filter((t) => t.worktreeId === worktreeId)
    .sort(compareThreadSort);
}

function buildThreadContexts(
  worktrees: Worktree[],
  threads: Thread[],
  activeProjectId: string | null
): WorkspaceThreadContext[] {
  return orderProjectWorktrees(getActiveProjectWorktrees(worktrees, activeProjectId)).map(
    (worktree) => ({
      worktreeId: worktree.id,
      worktree,
      displayLabel: worktreeDisplayLabel(worktree),
      isDefault: worktree.isDefault,
      threads: threadsForWorktree(threads, worktree.id)
    })
  );
}

export function useActiveWorkspace() {
  const route = useRoute();
  const workspace = useWorkspaceStore();

  const activeProjectId = computed<string | null>(() => {
    const id = route.params.projectId;
    return typeof id === "string" && id.length > 0 ? id : null;
  });

  const activeProject = computed(() =>
    workspace.projects.find((p) => p.id === activeProjectId.value)
  );

  const activeBranch = computed<string | null>(() => {
    const b = route.params.branch;
    return typeof b === "string" && b.length > 0 ? decodeBranch(b) : null;
  });

  const activeWorktree = computed<Worktree | undefined>(() =>
    workspace.worktrees.find(
      (w) => w.projectId === activeProjectId.value && w.branch === activeBranch.value
    )
  );

  const activeWorktreeId = computed<string | null>(() => activeWorktree.value?.id ?? null);

  const activeThreadId = computed<string | null>(() => {
    const id = route.params.threadId;
    return typeof id === "string" && id.length > 0 ? id : null;
  });

  const activeThread = computed(() =>
    workspace.threads.find((t) => t.id === activeThreadId.value)
  );

  const activeThreads = computed<Thread[]>(() => {
    if (!activeWorktreeId.value) return [];
    return threadsForWorktree(workspace.threads, activeWorktreeId.value);
  });

  const activeProjectThreads = computed<Thread[]>(() => {
    const pid = activeProjectId.value;
    if (!pid) return [];
    const orderedWt = orderProjectWorktrees(getActiveProjectWorktrees(workspace.worktrees, pid));
    const wtRank = new Map(orderedWt.map((w, i) => [w.id, i]));
    return workspace.threads
      .filter((t) => wtRank.has(t.worktreeId))
      .sort((a, b) => {
        const ra = wtRank.get(a.worktreeId) ?? 0;
        const rb = wtRank.get(b.worktreeId) ?? 0;
        if (ra !== rb) return ra - rb;
        return compareThreadSort(a, b);
      });
  });

  const defaultWorktree = computed<Worktree | undefined>(() =>
    workspace.worktrees.find(
      (w) => w.projectId === activeProjectId.value && w.isDefault
    )
  );

  const threadGroups = computed<Worktree[]>(() => {
    if (!activeProjectId.value) return [];
    return workspace.worktrees.filter(
      (w) => w.projectId === activeProjectId.value && !w.isDefault
    );
  });

  const threadContexts = computed<WorkspaceThreadContext[]>(() =>
    buildThreadContexts(workspace.worktrees, workspace.threads, activeProjectId.value)
  );

  const activeContextBadge = computed((): WorkspaceContextBadge | null => {
    const wt = activeWorktree.value;
    const pid = activeProjectId.value;
    if (!wt || !pid || wt.projectId !== pid) {
      return null;
    }
    return {
      worktreeId: wt.id,
      displayLabel: worktreeDisplayLabel(wt),
      isDefault: wt.isDefault,
      threadCount: threadsForWorktree(workspace.threads, wt.id).length
    };
  });

  const hasActiveWorkspace = computed<boolean>(() =>
    Boolean(activeProjectId.value && activeWorktree.value?.path)
  );

  return {
    activeProjectId,
    activeProject,
    activeBranch,
    activeWorktree,
    activeWorktreeId,
    activeThreadId,
    activeThread,
    activeThreads,
    activeProjectThreads,
    defaultWorktree,
    threadGroups,
    threadContexts,
    activeContextBadge,
    hasActiveWorkspace
  };
}
