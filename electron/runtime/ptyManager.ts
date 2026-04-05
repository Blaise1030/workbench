import pty from "node-pty";
type PtyProcess = import("node-pty").IPty;

export interface PtySession {
  id: string;
  process: PtyProcess;
}

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  start(id: string, file: string, args: string[], cwd: string, onData: (chunk: string) => void): PtySession {
    const ptyProcess = pty.spawn(file, args, {
      cols: 120,
      rows: 40,
      cwd,
      env: globalThis.process.env as Record<string, string>
    });
    ptyProcess.onData(onData);
    const session = { id, process: ptyProcess };
    this.sessions.set(id, session);
    return session;
  }

  write(id: string, input: string): void {
    this.sessions.get(id)?.process.write(input);
  }

  interrupt(id: string): void {
    this.sessions.get(id)?.process.kill("SIGINT");
  }

  stop(id: string): void {
    this.sessions.get(id)?.process.kill();
    this.sessions.delete(id);
  }
}
