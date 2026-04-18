import type { InjectionKey } from "vue";
import type { useThreadContextQueue } from "@/composables/useThreadContextQueue";
import type { QueueItem } from "@/contextQueue/types";

export type ThreadContextQueueApi = ReturnType<typeof useThreadContextQueue>;

export const threadContextQueueKey: InjectionKey<ThreadContextQueueApi> = Symbol("threadContextQueue");

/** Send prepared queue rows to a thread’s agent PTY (focus agent tab first). Defaults to active thread. */
export type InjectContextToAgentFn = (
  items: QueueItem[],
  opts?: { sessionId?: string }
) => Promise<boolean>;

export const injectContextToAgentKey: InjectionKey<InjectContextToAgentFn> = Symbol("injectContextToAgent");

/** Open a worktree-relative file in the files pane. */
export type OpenWorkspaceFileFn = (path: string) => Promise<void>;

export const openWorkspaceFileKey: InjectionKey<OpenWorkspaceFileFn> = Symbol("openWorkspaceFile");
