import { defineStore } from "pinia";
import type { RunStatus } from "@shared/domain";

export interface RunConsole {
  runId: string;
  threadId: string;
  status: RunStatus;
  output: string[];
}

export const useRunStore = defineStore("run", {
  state: () => ({
    runs: [] as RunConsole[],
    _index: new Map<string, RunConsole>()
  }),
  getters: {
    /** Latest run status keyed by threadId. Runs are stored newest-first. */
    statusByThreadId(state): Record<string, RunStatus> {
      const map: Record<string, RunStatus> = {};
      for (const run of state.runs) {
        if (!map[run.threadId]) map[run.threadId] = run.status;
      }
      return map;
    }
  },
  actions: {
    start(runId: string, threadId: string): void {
      const entry: RunConsole = { runId, threadId, status: "running", output: [] };
      this.runs.unshift(entry);
      this._index.set(runId, entry);
    },
    append(runId: string, line: string): void {
      this._index.get(runId)?.output.push(line);
    },
    setStatus(runId: string, status: RunStatus): void {
      const run = this._index.get(runId);
      if (run) run.status = status;
    }
  }
});
