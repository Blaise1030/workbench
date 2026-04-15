import type { StagedUnifiedDiffResult } from "@shared/ipc";
import {
  generateCommitCandidates as generateCommitCandidatesInThread,
  generateThreadTitle as generateThreadTitleInThread
} from "./engine";

type WorkerRequest =
  | { id: number; kind: "commit"; diff: StagedUnifiedDiffResult }
  | { id: number; kind: "title"; userMessage: string; agentLabel: string };

type WorkerResponse =
  | { id: number; ok: true; commitCandidates: string[] }
  | { id: number; ok: true; threadTitle: string }
  | { id: number; ok: false; error: string };

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

let worker: Worker | null = null;
let workerDisabled = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function settleResponse(msg: WorkerResponse): void {
  const item = pending.get(msg.id);
  if (!item) return;
  pending.delete(msg.id);
  if (!msg.ok) {
    item.reject(new Error(msg.error));
    return;
  }
  if ("commitCandidates" in msg) item.resolve(msg.commitCandidates);
  else item.resolve(msg.threadTitle);
}

function disableWorkerWithError(err: unknown): void {
  workerDisabled = true;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [id, p] of [...pending.entries()]) {
    pending.delete(id);
    p.reject(err);
  }
}

function ensureWorker(): Worker | null {
  if (workerDisabled) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerDisabled = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      settleResponse(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      disableWorkerWithError(new Error(event.message || "Local LLM worker crashed"));
    };
    return worker;
  } catch {
    workerDisabled = true;
    return null;
  }
}

function postToWorker<T>(request: WorkerRequest): Promise<T> {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Error("worker unavailable"));
  return new Promise<T>((resolve, reject) => {
    pending.set(request.id, { resolve, reject });
    try {
      w.postMessage(request);
    } catch (e) {
      pending.delete(request.id);
      reject(e);
    }
  });
}

export async function generateCommitCandidates(diff: StagedUnifiedDiffResult): Promise<string[]> {
  const request: WorkerRequest = { id: nextId++, kind: "commit", diff };
  try {
    return await postToWorker<string[]>(request);
  } catch {
    return generateCommitCandidatesInThread(diff);
  }
}

export async function generateThreadTitle(userMessage: string, agentLabel: string): Promise<string> {
  const request: WorkerRequest = { id: nextId++, kind: "title", userMessage, agentLabel };
  try {
    return await postToWorker<string>(request);
  } catch {
    return generateThreadTitleInThread(userMessage, agentLabel);
  }
}

export function __resetLocalLlmClientForTests(): void {
  if (!import.meta.vitest) return;
  if (worker) worker.terminate();
  worker = null;
  workerDisabled = false;
  nextId = 1;
  pending.clear();
}
