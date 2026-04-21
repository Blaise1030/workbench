import { onBeforeUnmount, type Ref } from "vue";
import type { useWorkspaceStore } from "@/stores/workspaceStore";

export function useWorktreeHealth(
  workspace: ReturnType<typeof useWorkspaceStore>,
  staleWorktreeIds: Ref<Set<string>>
): void {
  async function checkWorktreeHealth(): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api?.worktreeHealth) return;

    const nextStale = new Set<string>();
    for (const wt of workspace.threadGroups) {
      const { exists } = await api.worktreeHealth(wt.id);
      if (!exists) nextStale.add(wt.id);
    }
    staleWorktreeIds.value = nextStale;
  }

  let worktreeHealthInterval: ReturnType<typeof setInterval> | null = null;

  worktreeHealthInterval = setInterval(() => void checkWorktreeHealth(), 60_000);
  void checkWorktreeHealth();

  onBeforeUnmount(() => {
    if (worktreeHealthInterval) clearInterval(worktreeHealthInterval);
  });
}
