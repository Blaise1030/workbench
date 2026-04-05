import { randomUUID } from "node:crypto";
import { ClaudeCodeCliAdapter } from "../adapters/claudeCodeCliAdapter.js";
import { CodexCliAdapter } from "../adapters/codexCliAdapter.js";
import type { AgentKind } from "../adapters/types.js";
import { PtyManager } from "../runtime/ptyManager.js";

type OutputListener = (runId: string, chunk: string) => void;
type StateListener = (runId: string, status: "running" | "needsReview" | "failed" | "done") => void;

export class RunService {
  private pty = new PtyManager();
  private codex = new CodexCliAdapter();
  private claude = new ClaudeCodeCliAdapter();

  start(agent: AgentKind, cwd: string, prompt: string, onOutput: OutputListener, onState: StateListener): string {
    const runId = randomUUID();
    const adapter = agent === "codex" ? this.codex : this.claude;
    const command = adapter.command({ cwd, prompt, threadId: runId });

    this.pty.start(runId, command.file, command.args, cwd, (chunk) => {
      onOutput(runId, chunk);
      const state = adapter.detectState(chunk);
      if (state) onState(runId, state);
    });
    onState(runId, "running");
    return runId;
  }

  sendInput(runId: string, input: string): void {
    this.pty.write(runId, `${input}\r`);
  }

  interrupt(runId: string): void {
    this.pty.interrupt(runId);
  }

  stop(runId: string): void {
    this.pty.stop(runId);
  }
}
