import { onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { RunStatus, Thread } from "@shared/domain";
import { playTerminalChirp } from "@/terminal/playTerminalChirp";

export type UseThreadPtyRunStatusOpts = {
  /** Thread the user is focused on; idle attention and chirps use this. */
  activeThreadId: Ref<string | null>;
  /** When false, completion does not play the attention chirp (row may still highlight). */
  notificationsEnabled: Ref<boolean>;
};

/**
 * Derives per-thread run status from hook events (via main-process IPC).
 * Replaces PTY-output heuristics — state is now authoritative from agent lifecycle hooks.
 *
 * When a thread transitions to done/needsReview/failed while not the active thread,
 * marks `idleAttentionByThreadId` (blue highlight) and plays one chirp.
 */
export function useThreadPtyRunStatus(
  threads: Ref<readonly Thread[]> | ComputedRef<readonly Thread[]>,
  opts: UseThreadPtyRunStatusOpts
): {
  runStatusByThreadId: Ref<Record<string, RunStatus>>;
  idleAttentionByThreadId: Ref<Record<string, boolean>>;
  clearIdleAttention: (threadId: string) => void;
  markUserInput: (sessionId: string) => void;
} {
  const runStatusByThreadId = ref<Record<string, RunStatus>>({});
  const idleAttentionByThreadId = ref<Record<string, boolean>>({});

  function clearIdleAttention(threadId: string): void {
    if (!idleAttentionByThreadId.value[threadId]) return;
    const next = { ...idleAttentionByThreadId.value };
    delete next[threadId];
    idleAttentionByThreadId.value = next;
  }

  // markUserInput kept for API compatibility — no-op now that PTY scraping is removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function markUserInput(_sessionId: string): void {}

  function applyHookState(threadId: string, state: string): void {
    const valid = state === "running" || state === "done" || state === "needsReview" || state === "failed";
    if (!valid) return;

    const status = state as RunStatus;
    const inFocus = opts.activeThreadId.value === threadId;

    if (status === "running") {
      clearIdleAttention(threadId);
    } else {
      // done / needsReview / failed — highlight + chirp when not in focus
      if (!inFocus) {
        idleAttentionByThreadId.value = { ...idleAttentionByThreadId.value, [threadId]: true };
        if (opts.notificationsEnabled.value) {
          playTerminalChirp();
        }
      }
    }

    runStatusByThreadId.value = { ...runStatusByThreadId.value, [threadId]: status };
  }

  let disposeHook: (() => void) | null = null;

  onMounted(() => {
    const api = typeof window !== "undefined" ? window.workspaceApi : undefined;
    if (!api?.onThreadRunStateChanged) return;
    disposeHook = api.onThreadRunStateChanged((threadId, state) => {
      applyHookState(threadId, state);
    });
  });

  // Clean up stale entries when threads are removed.
  watch(
    () => threads.value.map((t) => t.id).join("\0"),
    () => {
      const allow = new Set(threads.value.map((t) => t.id));
      for (const id of Object.keys(runStatusByThreadId.value)) {
        if (!allow.has(id)) {
          const next = { ...runStatusByThreadId.value };
          delete next[id];
          runStatusByThreadId.value = next;
        }
      }
      for (const id of Object.keys(idleAttentionByThreadId.value)) {
        if (!allow.has(id)) clearIdleAttention(id);
      }
    }
  );

  // Clear highlight when user navigates to that thread.
  watch(
    () => opts.activeThreadId.value,
    (id) => {
      if (id != null) clearIdleAttention(id);
    },
    { flush: "sync" }
  );

  onBeforeUnmount(() => {
    disposeHook?.();
    disposeHook = null;
  });

  return { runStatusByThreadId, idleAttentionByThreadId, clearIdleAttention, markUserInput };
}
