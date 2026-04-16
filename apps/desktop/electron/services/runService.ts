import { randomUUID } from "node:crypto";
import { ClaudeCodeCliAdapter } from "../adapters/claudeCodeCliAdapter.js";
import { CodexCliAdapter } from "../adapters/codexCliAdapter.js";
import { CursorCliAdapter } from "../adapters/cursorCliAdapter.js";
import { GeminiCliAdapter } from "../adapters/geminiCliAdapter.js";
import type { AgentAdapter, AgentKind } from "../adapters/types.js";
import { PtyManager } from "../runtime/ptyManager.js";

type OutputListener = (runId: string, chunk: string) => void;

export class RunService {
  private pty = new PtyManager();
  private codex = new CodexCliAdapter();
  private claude = new ClaudeCodeCliAdapter();
  private cursor = new CursorCliAdapter();
  private gemini = new GeminiCliAdapter();

  private adapterFor(agent: AgentKind): AgentAdapter {
    switch (agent) {
      case "codex":
        return this.codex;
      case "claude":
        return this.claude;
      case "cursor":
        return this.cursor;
      case "gemini":
        return this.gemini;
      default: {
        const _exhaustive: never = agent;
        return _exhaustive;
      }
    }
  }

  start(agent: AgentKind, cwd: string, prompt: string, onOutput: OutputListener): string {
    const runId = randomUUID();
    const adapter = this.adapterFor(agent);
    const command = adapter.command({ cwd, prompt, threadId: runId });

    this.pty.start(runId, command.file, command.args, cwd, (chunk) => {
      onOutput(runId, chunk);
    });
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
