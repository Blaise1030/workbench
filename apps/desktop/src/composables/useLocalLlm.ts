import { ref } from "vue";
import type { StagedUnifiedDiffResult } from "@shared/ipc";
import { generateCommitCandidates } from "@/features/localLlm/client";
import { isWebGpuUsable } from "@/features/localLlm/webgpuSupport";

export type CommitSuggestState = "idle" | "loading" | "ready" | "generating" | "error";

/**
 * Local WebLLM commit suggestions. Call `probeWebGpu()` when the Source Control tab is shown,
 * or rely on `suggestFromStaged` probing once while `webGpuOk` is still `null`.
 */
export function useLocalLlm(getApi: () => WorkspaceApi | null = () => window.workspaceApi ?? null) {
  const webGpuOk = ref<boolean | null>(null);
  const commitSuggestState = ref<CommitSuggestState>("idle");
  const commitSuggestError = ref<string | null>(null);
  const commitCandidates = ref<string[]>([]);
  const lastStagedTruncated = ref(false);

  async function probeWebGpu(): Promise<void> {
    webGpuOk.value = await isWebGpuUsable();
  }

  async function suggestFromStaged(cwd: string | null): Promise<void> {
    if (!cwd) return;
    if (webGpuOk.value === null) await probeWebGpu();

    const api = getApi();
    if (!api?.stagedUnifiedDiff) return;

    if (webGpuOk.value === false) {
      commitSuggestError.value = "WebGPU is not available in this environment.";
      commitSuggestState.value = "error";
      return;
    }

    commitSuggestError.value = null;
    commitCandidates.value = [];
    commitSuggestState.value = "generating";
    try {
      const diff: StagedUnifiedDiffResult = await api.stagedUnifiedDiff(cwd);
      lastStagedTruncated.value = diff.truncated;
      commitCandidates.value = await generateCommitCandidates(diff);
      commitSuggestState.value = "ready";
    } catch (e) {
      commitSuggestError.value = e instanceof Error ? e.message : "Something went wrong.";
      commitSuggestState.value = "error";
    }
  }

  return {
    webGpuOk,
    probeWebGpu,
    commitSuggestState,
    commitSuggestError,
    commitCandidates,
    lastStagedTruncated,
    suggestFromStaged
  };
}
