import type { GitWorktreeListEntry } from "@shared/ipc";
import type { GitService } from "@/services/git/gitService";

type WorkspaceApi = NonNullable<typeof window.workspaceApi>;

/**
 * Git operations via the preload `workspaceApi` bridge (Electron IPC).
 */
export class IpcGitService implements GitService {
  constructor(private readonly api: WorkspaceApi | undefined = window.workspaceApi) {}

  private requireApi(): WorkspaceApi {
    if (!this.api) {
      throw new Error("IPC workspace API is not available.");
    }
    return this.api;
  }

  async listWorktrees(cwd: string): Promise<GitWorktreeListEntry[]> {
    const a = this.requireApi();
    if (!a.gitListWorktrees) {
      throw new Error("workspaceApi.gitListWorktrees is not available.");
    }
    return a.gitListWorktrees(cwd);
  }
}
