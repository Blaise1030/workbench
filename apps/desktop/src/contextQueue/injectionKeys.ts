import type { InjectionKey } from "vue";
import type { useThreadContextQueue } from "@/composables/useThreadContextQueue";

export type ThreadContextQueueApi = ReturnType<typeof useThreadContextQueue>;

export const threadContextQueueKey: InjectionKey<ThreadContextQueueApi> = Symbol("threadContextQueue");
