import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

const KEY = "instrument:pendingAgentBootstrap.v1";

export function stashPendingAgentBootstrap(payload: PendingAgentBootstrap): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

/** If stored bootstrap targets `threadId`, remove and return it; otherwise leave storage unchanged. */
export function takePendingAgentBootstrapForThread(threadId: string): PendingAgentBootstrap | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAgentBootstrap;
    if (parsed.threadId !== threadId) return null;
    sessionStorage.removeItem(KEY);
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}
