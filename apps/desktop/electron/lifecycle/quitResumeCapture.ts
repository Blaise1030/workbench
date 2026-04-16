import { extractResumeIdFromStdout, RESUME_CAPTURE_TAIL_CHARS } from "../adapters/resumeIdCapture.js";
import { isValidPersistedResumeId } from "../../src/shared/resumeSessionId.js";
import type { PtyService } from "../services/ptyService.js";
import type { WorkspaceService } from "../services/workspaceService.js";
import type { WorkspaceStore } from "../storage/store.js";

const CTRL_C_COUNT = 3;
const BETWEEN_CTRL_C_MS = 90;
const POLL_MS = 120;
const MAX_WAIT_MS = 2600;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCtrlCRepeated(ptyService: PtyService, sessionId: string): Promise<void> {
  for (let i = 0; i < CTRL_C_COUNT; i++) {
    ptyService.interrupt(sessionId);
    if (i < CTRL_C_COUNT - 1) {
      await sleep(BETWEEN_CTRL_C_MS);
    }
  }
}

function bufferTail(buffer: string): string {
  return buffer.length > RESUME_CAPTURE_TAIL_CHARS
    ? buffer.slice(-RESUME_CAPTURE_TAIL_CHARS)
    : buffer;
}

/**
 * Probe all live terminal instances by sending repeated Ctrl+C and scanning
 * their output for `agent --resume <id>` hints.
 */
export async function collectResumeIdsFromActiveTerminals(ptyService: PtyService): Promise<string[]> {
  const sessionIds = ptyService.listAgentThreadSessionIds();
  if (sessionIds.length === 0) return [];

  const found = new Set<string>();
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      await sendCtrlCRepeated(ptyService, sessionId);
      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const { buffer } = ptyService.getBuffer(sessionId);
        const tail = bufferTail(buffer);
        const resumeId = extractResumeIdFromStdout(tail);
        if (resumeId && isValidPersistedResumeId(resumeId)) {
          found.add(resumeId);
          return;
        }
      }
    })
  );
  return [...found];
}

/**
 * On app quit: send Ctrl+C repeatedly to each live agent thread PTY that has no `resumeId`,
 * then poll scrollback for `agent --resume=<id>` (parallel per thread).
 */
export async function captureResumeIdsBeforeQuit(
  store: WorkspaceStore,
  workspaceService: WorkspaceService,
  ptyService: PtyService
): Promise<void> {
  const sessionIds = ptyService.listAgentThreadSessionIds();

  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const thread = store.getThread(sessionId);
      if (!thread) return;

      const row = store.getThreadSession(sessionId);
      if (row?.resumeId && isValidPersistedResumeId(row.resumeId)) return;

      await sendCtrlCRepeated(ptyService, sessionId);

      const deadline = Date.now() + MAX_WAIT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const { buffer } = ptyService.getBuffer(sessionId);
        const tail = bufferTail(buffer);
        const resumeId = extractResumeIdFromStdout(tail);
        if (resumeId && workspaceService.captureResumeId(sessionId, resumeId)) {
          return;
        }
      }
    })
  );
}
