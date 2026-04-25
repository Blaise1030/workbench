import type { Thread } from "@shared/domain";
import type { CreateThreadInput, UpdateThreadInput } from "@shared/ipc";

/** Abstraction for thread CRUD and active-thread selection (see `ipcThreadManagementService.ts` for the IPC implementation). */
export interface ThreadManagementService {
  /** All threads in the workspace (from the latest snapshot). */
  loadThreads(projectId: string): Promise<Thread[]>;
  createThread(input: CreateThreadInput): Promise<Thread>;
  removeThread(threadId: string): Promise<void>;  
  updateThreadName(threadId: string, title: string): Promise<void>;  
  updateThread(input: UpdateThreadInput): Promise<void>;
}
