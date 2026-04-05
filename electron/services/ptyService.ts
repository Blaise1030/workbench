import { BrowserWindow } from "electron";
import * as pty from "node-pty";
import { IPC_CHANNELS } from "../../src/shared/ipc.js";

const MAX_BUFFER_BYTES = 100 * 1024; // 100 KB

interface PtySession {
  pty: pty.IPty;
  buffer: string;
}

export class PtyService {
  private sessions = new Map<string, PtySession>();

  getOrCreate(worktreeId: string, cwd: string): { buffer: string } {
    const existing = this.sessions.get(worktreeId);
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

    const session: PtySession = { pty: instance, buffer: "" };
    this.sessions.set(worktreeId, session);

    instance.onData((data) => {
      session.buffer += data;
      if (Buffer.byteLength(session.buffer, "utf8") > MAX_BUFFER_BYTES) {
        // Trim from the front, keeping roughly the last MAX_BUFFER_BYTES
        session.buffer = session.buffer.slice(-MAX_BUFFER_BYTES);
      }
      const payload = { worktreeId, data };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.terminalPtyData, payload);
      }
    });

    instance.onExit(() => {
      this.sessions.delete(worktreeId);
    });

    return { buffer: "" };
  }

  write(worktreeId: string, data: string): void {
    this.sessions.get(worktreeId)?.pty.write(data);
  }

  resize(worktreeId: string, cols: number, rows: number): void {
    this.sessions.get(worktreeId)?.pty.resize(cols, rows);
  }

  kill(worktreeId: string): void {
    const session = this.sessions.get(worktreeId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(worktreeId);
    }
  }

  /** Worktree IDs that currently have a live integrated-terminal PTY session. */
  listSessionWorktreeIds(): string[] {
    return [...this.sessions.keys()];
  }
}
