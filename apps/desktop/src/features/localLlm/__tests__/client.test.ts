import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StagedUnifiedDiffResult } from "@shared/ipc";

const generateCommitCandidatesMock = vi.fn<(diff: StagedUnifiedDiffResult) => Promise<string[]>>();
const generateThreadTitleMock = vi.fn<(userMessage: string, agentLabel: string) => Promise<string>>();

vi.mock("@/features/localLlm/engine", () => ({
  generateCommitCandidates: generateCommitCandidatesMock,
  generateThreadTitle: generateThreadTitleMock
}));

describe("localLlm client", () => {
  const realWorker = globalThis.Worker;

  beforeEach(() => {
    generateCommitCandidatesMock.mockReset();
    generateThreadTitleMock.mockReset();
  });

  afterEach(async () => {
    globalThis.Worker = realWorker;
    const mod = await import("@/features/localLlm/client");
    mod.__resetLocalLlmClientForTests();
  });

  it("falls back to in-thread engine when Worker is unavailable", async () => {
    globalThis.Worker = undefined as typeof Worker;
    generateCommitCandidatesMock.mockResolvedValue(["feat: from main thread"]);
    const mod = await import("@/features/localLlm/client");
    const out = await mod.generateCommitCandidates({
      unifiedDiff: "diff --git a/a b/a",
      truncated: false
    });
    expect(out).toEqual(["feat: from main thread"]);
    expect(generateCommitCandidatesMock).toHaveBeenCalledTimes(1);
  });
});
