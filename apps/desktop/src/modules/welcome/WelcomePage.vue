<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import { ChevronRight, FolderOpen } from "lucide-vue-next";
import type { WorkspaceSnapshot } from "@shared/ipc";
import { encodeBranch } from "@/router/branchParam";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/button";

const router = useRouter();
const workspace = useWorkspaceStore();

const { data: welcomeProjects, isPending: welcomeProjectsPending } = useQuery({
  queryKey: ["welcomeProjects"],
  enabled: computed(() => Boolean(window.workspaceApi?.getSnapshot)),
  queryFn: async () => {
    const res = (await window.workspaceApi!.getSnapshot()) as WorkspaceSnapshot;
    return [...(res.projects ?? [])].sort((a, b) => a.tabOrder - b.tabOrder);
  },
});

async function navigateToProject(targetProjectId: string): Promise<void> {
  const api = window.workspaceApi;
  if (!api?.getSnapshot) return;

  let snapshot = (await api.getSnapshot()) as WorkspaceSnapshot;
  workspace.hydrate(snapshot);

  if (api.syncWorktrees) {
    const synced = await api.syncWorktrees(targetProjectId);
    if (synced) {
      workspace.hydrate(synced as WorkspaceSnapshot);
    }
  }

  snapshot = (await api.getSnapshot()) as WorkspaceSnapshot;
  workspace.hydrate(snapshot);

  const project = workspace.projects.find((p) => p.id === targetProjectId);
  if (!project) return;

  const worktree =
    workspace.worktrees.find(
      (w) => w.projectId === targetProjectId && w.id === project.lastActiveWorktreeId
    ) ?? workspace.worktrees.find((w) => w.projectId === targetProjectId && w.isDefault);
  if (!worktree) return;

  const lastThreadId = worktree.lastActiveThreadId;
  const thread =
    (lastThreadId && workspace.threads.find((t) => t.id === lastThreadId)) ||
    workspace.threads.find((t) => t.worktreeId === worktree.id);

  if (api.setActive) {
    await api.setActive({
      projectId: targetProjectId,
      worktreeId: worktree.id,
      threadId: thread?.id ?? null,
    });
  }

  snapshot = (await api.getSnapshot()) as WorkspaceSnapshot;
  workspace.hydrate(snapshot);

  const eb = encodeBranch(worktree.branch);
  if (thread) {
    await router.push({
      name: "agent",
      params: { projectId: targetProjectId, branch: eb, threadId: thread.id },
    });
  } else {
    await router.push({
      name: "threadNew",
      params: { projectId: targetProjectId, branch: eb },
    });
  }
}
</script>

<template>
  <div
    class="min-h-svh flex flex-col items-center justify-start bg-background px-6 py-16 text-foreground"
  >
    <div class="w-full max-w-lg flex flex-col gap-8">
      <div class="flex flex-col items-center gap-2 text-center">
        <div class="rounded-xl border bg-card px-4 py-3 shadow-sm">
          <FolderOpen class="size-10 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Workspaces</h1>
        <p class="text-sm text-muted-foreground max-w-sm">
          Open a recent repository or pick from the list below.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects</p>
        <p
          v-if="welcomeProjectsPending"
          class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
        >
          Loading workspaces…
        </p>
        <div v-else-if="(welcomeProjects ?? []).length > 0" class="flex flex-col gap-2">
          <Button
            v-for="p in welcomeProjects ?? []"
            :key="p.id"
            type="button"
            variant="outline"
            class="h-auto w-full justify-between gap-4 px-4 py-3 text-start font-normal"
            @click="navigateToProject(p.id)"
          >
            <span class="min-w-0 flex flex-col gap-0.5">
              <span class="truncate font-medium text-foreground">{{ p.name }}</span>
              <span class="truncate text-xs text-muted-foreground" :title="p.repoPath">{{
                p.repoPath
              }}</span>
            </span>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </div>
        <p
          v-else
          class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No projects in this workspace yet. Add a folder from the app menu once you are inside a
          project, or reopen a repo you have added before.
        </p>
      </div>
    </div>
  </div>
</template>
