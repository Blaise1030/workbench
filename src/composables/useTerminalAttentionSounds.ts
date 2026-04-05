import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import { decideTerminalAttentionChunk } from "@/terminal/attentionRules";
import { playTerminalChirp } from "@/terminal/playTerminalChirp";

/**
 * Subscribes once to `onPtyData`, plays attention chirp per spec (bell + optional one-shot background).
 * `visibleSessionId` is the PTY session id currently shown in the center panel (`null` on Git Diff / no session).
 */
export function useTerminalAttentionSounds(opts: {
  visibleSessionId: Ref<string | null>;
  bellEnabled: Ref<boolean>;
  backgroundEnabled: Ref<boolean>;
}): void {
  /** `true` = one-shot armed; `false` = disarmed until re-arm; missing = treat as armed. */
  const backgroundArmedBySession = new Map<string, boolean>();

  function rearmVisibleSession(): void {
    const v = opts.visibleSessionId.value;
    if (v != null) {
      backgroundArmedBySession.set(v, true);
    }
  }

  watch(() => opts.visibleSessionId.value, rearmVisibleSession, { flush: "sync" });

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
        backgroundArmed: armed
      });

      if (decision.playSound) {
        playTerminalChirp();
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
