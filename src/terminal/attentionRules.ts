/** BEL / terminal bell character. */
const BEL = "\x07";

export function chunkContainsBell(data: string): boolean {
  return data.includes(BEL);
}

/** True if the chunk contains any character other than BEL (for background-output rule). */
export function chunkHasNonBellContent(data: string): boolean {
  return data.replaceAll(BEL, "").length > 0;
}

/**
 * PTY session id shown in the integrated terminal, matching `TerminalPane` / `ptySessionId`:
 * thread id when active, else `__wt:${worktreeId}`.
 */
export function visibleTerminalSessionId(
  activeThreadId: string | null | undefined,
  activeWorktreeId: string | null | undefined
): string | null {
  if (activeWorktreeId == null || activeWorktreeId === "") {
    return null;
  }
  if (activeThreadId != null && activeThreadId !== "") {
    return activeThreadId;
  }
  return `__wt:${activeWorktreeId}`;
}

export type AttentionChunkInput = {
  sessionId: string;
  data: string;
  visibleSessionId: string | null;
  bellEnabled: boolean;
  backgroundEnabled: boolean;
  /** When false, background one-shot will not fire until re-armed. */
  backgroundArmed: boolean;
};

export type AttentionChunkResult = {
  playSound: boolean;
  /** True when the background-output rule fired; caller should disarm for this session. */
  consumedBackgroundOneShot: boolean;
};

export function decideTerminalAttentionChunk(input: AttentionChunkInput): AttentionChunkResult {
  const hasBell = chunkContainsBell(input.data);
  const hasNonBell = chunkHasNonBellContent(input.data);
  const inView = input.visibleSessionId != null && input.sessionId === input.visibleSessionId;

  const playBell = input.bellEnabled && hasBell;
  const playBackground =
    input.backgroundEnabled && !inView && hasNonBell && input.backgroundArmed;

  return {
    playSound: playBell || playBackground,
    consumedBackgroundOneShot: playBackground
  };
}
