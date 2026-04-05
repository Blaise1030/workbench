import { BrowserWindow } from "electron";
import * as pty from "node-pty";
import { IPC_CHANNELS } from "../../src/shared/ipc.js";

const MAX_BUFFER_BYTES = 100 * 1024; // 100 KB

interface PtySession {
  pty: pty.IPty;
  buffer: string;
  /** Owning worktree (for UI: “terminal open on this worktree”). */
  worktreeId: string;
}

export class PtyService {
  private sessions = new Map<string, PtySession>();
  private pendingInputBySessionId = new Map<string, string>();
  private submittedInputListener: ((sessionId: string, input: string) => void) | null = null;

  setSubmittedInputListener(listener: ((sessionId: string, input: string) => void) | null): void {
    this.submittedInputListener = listener;
  }

  /**
   * @param sessionId Stable PTY key: thread id, or `__wt:${worktreeId}` when no thread is active.
   */
  getOrCreate(sessionId: string, cwd: string, worktreeId: string): { buffer: string } {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return { buffer: existing.buffer };
    }

    const shell = process.env.SHELL ?? "/bin/zsh";
    const instance = pty.spawn(shell, [], {
      name: "xterm-256color",
      cwd,
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24
    });

    const session: PtySession = { pty: instance, buffer: "", worktreeId };
    this.sessions.set(sessionId, session);

    instance.onData((data) => {
      session.buffer += data;
      if (Buffer.byteLength(session.buffer, "utf8") > MAX_BUFFER_BYTES) {
        session.buffer = session.buffer.slice(-MAX_BUFFER_BYTES);
      }
      const payload = { sessionId, data };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.terminalPtyData, payload);
      }
    });

    instance.onExit(() => {
      this.sessions.delete(sessionId);
    });

    return { buffer: "" };
  }

  write(sessionId: string, data: string): void {
    this.captureSubmittedInput(sessionId, data);
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.pty.resize(cols, rows);
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(sessionId);
    }
    this.pendingInputBySessionId.delete(sessionId);
  }

  /** Distinct worktree IDs that have at least one live integrated-terminal session. */
  listSessionWorktreeIds(): string[] {
    const set = new Set<string>();
    for (const s of this.sessions.values()) {
      set.add(s.worktreeId);
    }
    return [...set];
  }

  private captureSubmittedInput(sessionId: string, data: string): void {
    if (!this.submittedInputListener) return;

    let pending = this.pendingInputBySessionId.get(sessionId) ?? "";

    for (const char of data) {
      if (char === "\r" || char === "\n") {
        const submitted = pending;
        pending = "";
        if (submitted.trim()) {
          this.submittedInputListener(sessionId, submitted);
        }
        continue;
      }

      if (char === "\u007f" || char === "\b") {
        pending = pending.slice(0, -1);
        continue;
      }

      if (char === "\u001b") continue;
      if (/[\u0000-\u001f]/.test(char)) continue;
      pending += char;
    }

    this.pendingInputBySessionId.set(sessionId, pending);
  }
}
