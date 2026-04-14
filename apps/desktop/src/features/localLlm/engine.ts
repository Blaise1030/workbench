import type { StagedUnifiedDiffResult } from "@shared/ipc";
import { buildCommitSuggestionPrompt } from "./commitPrompt";
import { DEFAULT_MLC_MODEL_ID } from "./constants";
import { parseCommitCandidates, parseThreadTitle } from "./parseModelText";
import { buildThreadTitlePrompt } from "./threadTitlePrompt";
import { isWebGpuUsable } from "./webgpuSupport";

type WebLlmEngine = Awaited<
  ReturnType<Awaited<typeof import("@mlc-ai/web-llm")>["CreateMLCEngine"]>
>;

type Job =
  | { kind: "commit"; diff: StagedUnifiedDiffResult }
  | { kind: "title"; userMessage: string; agentLabel: string };

type Queued = {
  job: Job;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

const jobs: Queued[] = [];
let draining = false;
let engine: WebLlmEngine | undefined;

async function ensureEngine(): Promise<WebLlmEngine> {
  if (engine) return engine;
  if (!(await isWebGpuUsable())) {
    throw new Error("WebGPU is not available");
  }
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  engine = await CreateMLCEngine(DEFAULT_MLC_MODEL_ID);
  return engine;
}

async function drain(): Promise<void> {
  if (draining) return;
  const item = jobs.shift();
  if (!item) return;
  draining = true;
  try {
    const eng = await ensureEngine();
    if (item.job.kind === "commit") {
      const prompt = buildCommitSuggestionPrompt(
        item.job.diff.unifiedDiff,
        item.job.diff.truncated,
      );
      const out = await eng.chat.completions.create({
        messages: [
          { role: "system", content: "You output concise git subject lines only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 200,
      });
      const text = out.choices[0]?.message?.content?.trim() ?? "";
      const cands = parseCommitCandidates(text);
      if (cands.length === 0) throw new Error("Empty commit suggestions");
      item.resolve(cands);
    } else {
      const prompt = buildThreadTitlePrompt(item.job.userMessage, item.job.agentLabel);
      const out = await eng.chat.completions.create({
        messages: [
          { role: "system", content: "You output a single short thread title." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 64,
      });
      const text = out.choices[0]?.message?.content?.trim() ?? "";
      const title = parseThreadTitle(text);
      if (!title) throw new Error("Empty thread title");
      item.resolve(title);
    }
  } catch (e) {
    item.reject(e);
  } finally {
    draining = false;
    void drain();
  }
}

function enqueueCommit(diff: StagedUnifiedDiffResult): Promise<string[]> {
  return new Promise((resolve, reject) => {
    jobs.push({ job: { kind: "commit", diff }, resolve, reject });
    void drain();
  });
}

function enqueueTitle(userMessage: string, agentLabel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jobs.push({ job: { kind: "title", userMessage, agentLabel }, resolve, reject });
    void drain();
  });
}

export function generateCommitCandidates(diff: StagedUnifiedDiffResult): Promise<string[]> {
  return enqueueCommit(diff);
}

export function generateThreadTitle(userMessage: string, agentLabel: string): Promise<string> {
  return enqueueTitle(userMessage, agentLabel);
}

export function __resetEngineForTests(): void {
  if (!import.meta.vitest) return;
  engine = undefined;
  jobs.length = 0;
  draining = false;
}
