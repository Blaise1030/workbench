import type { WorkspaceSnapshot } from "@shared/ipc";
import { useToast } from "@/composables/useToast";
import { displayNameFromRepoPath, normalizeRepoPathForCompare } from "@/lib/repoPathUtils";

export function useAddProjectFromDirectoryPick(options: {
  navigateToProject: (projectId: string) => Promise<void>;
}): { pickAndAddProject: () => Promise<void> } {
  const toast = useToast();

  async function pickAndAddProject(): Promise<void> {
    if (
      typeof window === "undefined" ||
      !window.workspaceApi?.getSnapshot ||
      !window.workspaceApi.pickRepoDirectory ||
      !window.workspaceApi.addProject
    ) {
      return;
    }

    const api = window.workspaceApi;
    const before = (await api.getSnapshot()) as WorkspaceSnapshot;

    const picked = await api.pickRepoDirectory();
    if (picked == null) {
      return;
    }

    if (
      before.projects.some(
        (p) => normalizeRepoPathForCompare(p.repoPath) === normalizeRepoPathForCompare(picked)
      )
    ) {
      toast.error("Already in workspace", "This folder is already in the workspace.");
      return;
    }

    const name = displayNameFromRepoPath(picked);

    let after: WorkspaceSnapshot;
    try {
      after = (await api.addProject({ name, repoPath: picked })) as WorkspaceSnapshot;
    } catch (err) {
      toast.error("Could not add project", String(err));
      return;
    }

    const added = after.projects.find(
      (p) => normalizeRepoPathForCompare(p.repoPath) === normalizeRepoPathForCompare(picked)
    );
    if (!added) {
      toast.error(
        "Could not add project",
        "Project was added but could not be found in the workspace snapshot."
      );
      return;
    }

    await options.navigateToProject(added.id);
  }

  return { pickAndAddProject };
}
