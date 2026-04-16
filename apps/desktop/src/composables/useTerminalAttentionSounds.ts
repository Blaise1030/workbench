import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import { decideTerminalAttentionChunk } from "@/terminal/attentionRules";
import type { TerminalActivitySensitivity } from "@/terminal/activitySensitivity";

/**
 * Subscribes once to `onPtyData`, plays attention chirp per spec (bell + optional one-shot background).
 * `visibleSessionId` is the PTY session id currently shown in the center panel (`null` on Git Diff / no session).
 *
 * **Chime cap:** at most **one** chirp per PTY session while that session is not visible; re-armed when the user
 * switches back to that session (same visible id). Stops repeated bells or background chunks from spamming sound.
 */
export function useTerminalAttentionSounds(opts: {
  visibleSessionId: Ref<string | null>;
  notificationsEnabled: Ref<boolean>;
  bellEnabled: Ref<boolean>;
  backgroundEnabled: Ref<boolean>;
  activitySensitivity: Ref<TerminalActivitySensitivity>;
}): void {
  /** `true` = one-shot armed; `false` = disarmed until re-arm; missing = treat as armed. */
  const backgroundArmedBySession = new Map<string, boolean>();
  /** After a chime for a session while away, `false` until that session is visible again. */
  const chimeArmedBySession = new Map<string, boolean>();

  function rearmVisibleSession(): void {
    const v = opts.visibleSessionId.value;
    if (v != null) {
      backgroundArmedBySession.set(v, true);
      chimeArmedBySession.set(v, true);
    }
  }

  watch(
    () => opts.visibleSessionId.value,
    (_, prev) => {
      // While a session is visible, BEL does not play and does not consume the one-shot chime.
      // After switching away, that session would still be "armed" until the next visit, so the next
      // BEL from the thread we left (still running) would incorrectly chirp. Disarm on leave.
      if (prev != null) {
        chimeArmedBySession.set(prev, false);
        backgroundArmedBySession.set(prev, false);
      }
      rearmVisibleSession();
    },
    { flush: "sync" }
  );

  let disposePty: (() => void) | null = null;

  onMounted(() => {
    const api = typeof window !== "undefined" ? window.workspaceApi : undefined;
    if (!api?.onPtyData) {
      return;
    }

    rearmVisibleSession();

    disposePty = api.onPtyData((sessionId, data) => {
      const visibleSessionId = opts.visibleSessionId.value;
      const armed = backgroundArmedBySession.get(sessionId) !== false;

      const decision = decideTerminalAttentionChunk({
        sessionId,
        data,
        visibleSessionId,
        bellEnabled: opts.bellEnabled.value,
        backgroundEnabled: opts.backgroundEnabled.value,
        backgroundArmed: armed,
        activitySensitivity: opts.activitySensitivity.value
      });

      if (decision.playSound && opts.notificationsEnabled.value) {
        chimeArmedBySession.set(sessionId, false);
      }
      if (decision.consumedBackgroundOneShot) {
        backgroundArmedBySession.set(sessionId, false);
      }
    });
  });

  onBeforeUnmount(() => {
    disposePty?.();
    disposePty = null;
  });
}
