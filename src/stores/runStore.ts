import { defineStore } from "pinia";
import type { RunStatus } from "@shared/domain";

export interface RunConsole {
  runId: string;
  status: RunStatus;
  output: string[];
}

export const useRunStore = defineStore("run", {
  state: () => ({
    runs: [] as RunConsole[]
  }),
  actions: {
    start(runId: string): void {
      this.runs.unshift({ runId, status: "running", output: [] });
    },
    append(runId: string, line: string): void {
      const run = this.runs.find((r) => r.runId === runId);
      if (run) run.output.push(line);
    },
    setStatus(runId: string, status: RunStatus): void {
      const run = this.runs.find((r) => r.runId === runId);
      if (run) run.status = status;
    }
  }
});
