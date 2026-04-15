import type { StagedUnifiedDiffResult } from "@shared/ipc";
import { generateCommitCandidates, generateThreadTitle } from "./engine";

type WorkerRequest =
  | { id: number; kind: "commit"; diff: StagedUnifiedDiffResult }
  | { id: number; kind: "title"; userMessage: string; agentLabel: string };

type WorkerResponse =
  | { id: number; ok: true; commitCandidates: string[] }
  | { id: number; ok: true; threadTitle: string }
  | { id: number; ok: false; error: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === "commit") {
      const commitCandidates = await generateCommitCandidates(req.diff);
      const out: WorkerResponse = { id: req.id, ok: true, commitCandidates };
      self.postMessage(out);
      return;
    }
    const threadTitle = await generateThreadTitle(req.userMessage, req.agentLabel);
    const out: WorkerResponse = { id: req.id, ok: true, threadTitle };
    self.postMessage(out);
  } catch (e) {
    const out: WorkerResponse = {
      id: req.id,
      ok: false,
      error: e instanceof Error ? e.message : "Local LLM worker failed"
    };
    self.postMessage(out);
  }
};
