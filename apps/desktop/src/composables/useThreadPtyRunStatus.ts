import { onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { RunStatus, Thread, ThreadAgent } from "@shared/domain";
import { detectRunStateFromChunk } from "@shared/agentRunStateFromChunk";
import { playTerminalChirp } from "@/terminal/playTerminalChirp";
import { hasMeaningfulPtyOutput } from "@/terminal/ptyChunkMeaningful";
import type { TerminalActivitySensitivity } from "@/terminal/activitySensitivity";

const IDLE_MS = 1000;

export type UseThreadPtyRunStatusOpts = {
  /** Thread the user is focused on; idle attention and chirps use this, not which terminal tab is visible. */
  activeThreadId: Ref<string | null>;
  /** When false, idle completion does not play the attention chirp (row may still highlight). */
  notificationsEnabled: Ref<boolean>;
  /** Shared activity sensitivity used for both idle detection and terminal sounds. */
  activitySensitivity: Ref<TerminalActivitySensitivity>;
};

/**
 * Derives per-thread agent run status from integrated-terminal PTY output (same heuristics as Electron adapters).
 * Sticky for needsReview / failed / done until new activity; running while output streams; idle after quiet period.
 *
 * When a thread was **running** and goes **idle** while it is **not** the active thread (`activeThreadId`),
 * marks `idleAttentionByThreadId` and plays one chirp (if notifications are on). Cleared when the user selects
 * that thread or when new output arrives. PTY chunks within 300ms of `markUserInput` for that thread are ignored
 * so typed echo does not count as program activity.
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
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastUserInputMs = new Map<string, number>();

  function markUserInput(sessionId: string): void {
    lastUserInputMs.set(sessionId, Date.now());
  }

  function clearIdleAttention(threadId: string): void {
    if (!idleAttentionByThreadId.value[threadId]) return;
    const next = { ...idleAttentionByThreadId.value };
    delete next[threadId];
    idleAttentionByThreadId.value = next;
  }

  function clearIdleTimer(threadId: string): void {
    const t = idleTimers.get(threadId);
    if (t != null) {
      clearTimeout(t);
      idleTimers.delete(threadId);
    }
  }

  function scheduleIdle(threadId: string): void {
    clearIdleTimer(threadId);
    idleTimers.set(
      threadId,
      setTimeout(() => {
        idleTimers.delete(threadId);
        const cur = runStatusByThreadId.value[threadId];
        if (cur === "needsReview" || cur === "failed" || cur === "done") return;

        const inFocus = opts.activeThreadId.value === threadId;

        if (cur === "running" && !inFocus) {
          idleAttentionByThreadId.value = { ...idleAttentionByThreadId.value, [threadId]: true };
          if (opts.notificationsEnabled.value) {
            playTerminalChirp();
          }
        }

        const next = { ...runStatusByThreadId.value };
        delete next[threadId];
        runStatusByThreadId.value = next;
      }, IDLE_MS)
    );
  }

  function applyChunk(threadId: string, agent: ThreadAgent, data: string): void {
    if (Date.now() - (lastUserInputMs.get(threadId) ?? 0) < 300) return;
    if (!hasMeaningfulPtyOutput(data, opts.activitySensitivity.value)) return;

    clearIdleAttention(threadId);

    const parsed = detectRunStateFromChunk(agent, data);
    const next = { ...runStatusByThreadId.value };

    if (parsed != null) {
      next[threadId] = parsed;
      runStatusByThreadId.value = next;
      clearIdleTimer(threadId);
      return;
    }

    next[threadId] = "running";
    runStatusByThreadId.value = next;
    scheduleIdle(threadId);
  }

  let disposePty: (() => void) | null = null;

  onMounted(() => {
    const api = typeof window !== "undefined" ? window.workspaceApi : undefined;
    if (!api?.onPtyData) return;

    disposePty = api.onPtyData((sessionId, data) => {
      if (sessionId.startsWith("__")) return;
      const thread = threads.value.find((t) => t.id === sessionId);
      if (!thread) return;
      applyChunk(sessionId, thread.agent, data);
    });
  });

  watch(
    () => threads.value.map((t) => t.id).join("\0"),
    () => {
      const allow = new Set(threads.value.map((t) => t.id));
      for (const id of Object.keys(runStatusByThreadId.value)) {
        if (!allow.has(id)) {
          clearIdleTimer(id);
          const next = { ...runStatusByThreadId.value };
          delete next[id];
          runStatusByThreadId.value = next;
        }
      }
      for (const id of Object.keys(idleAttentionByThreadId.value)) {
        if (!allow.has(id)) {
          clearIdleAttention(id);
        }
      }
    }
  );

  watch(
    () => opts.activeThreadId.value,
    (id) => {
      if (id != null) clearIdleAttention(id);
    },
    { flush: "sync" }
  );

  onBeforeUnmount(() => {
    disposePty?.();
    disposePty = null;
    for (const t of idleTimers.values()) clearTimeout(t);
    idleTimers.clear();
  });

  return { runStatusByThreadId, idleAttentionByThreadId, clearIdleAttention, markUserInput };
}
