import type { Thread } from "@shared/domain";
import type { CreateThreadInput, UpdateThreadInput, WorkspaceSnapshot } from "@shared/ipc";
import type { ThreadManagementService } from "@/services/thread-management/threadManagementService";

type WorkspaceApi = NonNullable<typeof window.workspaceApi>;

/**
 * Thread management via the preload `workspaceApi` bridge (Electron IPC).
 */
export class IpcThreadManagementService implements ThreadManagementService {
  constructor(private readonly api: WorkspaceApi | undefined = window.workspaceApi) {}

  private requireApi(): WorkspaceApi {
    if (!this.api) {
      throw new Error("IPC workspace API is not available.");
    }
    return this.api;
  }

  async loadThreads(projectId: string): Promise<Thread[]> {
    const a = this.requireApi();
    if (!a.getSnapshot) {
      throw new Error("workspaceApi.getSnapshot is not available.");
    }
    const snapshot = (await a.getSnapshot()) as WorkspaceSnapshot;
    return snapshot.threads.filter((thread) => thread.projectId === projectId);
  }

  async createThread(input: CreateThreadInput): Promise<Thread> {
    const a = this.requireApi();
    if (!a.createThread) {
      throw new Error("workspaceApi.createThread is not available.");
    }
    return (await a.createThread(input)) as Thread;
  }

  async removeThread(threadId: string): Promise<void> {
    const a = this.requireApi();
    if (!a.deleteThread) {
      throw new Error("workspaceApi.deleteThread is not available.");
    }
    await a.deleteThread({ threadId });
  }

  async updateThreadName(threadId: string, title: string): Promise<void> {
    const a = this.requireApi();
    if (!a.renameThread) {
      throw new Error("workspaceApi.renameThread is not available.");
    }
    await a.renameThread({ threadId, title });
  }

  async updateThread(input: UpdateThreadInput): Promise<void> {
    const a = this.requireApi();
    if (!a.updateThread) {
      throw new Error("workspaceApi.updateThread is not available.");
    }
    await a.updateThread(input);
  }
}
