import { ref } from "vue";
import { LruMap } from "@/lib/lruMap";
import type { useWorkspaceStore } from "@/stores/workspaceStore";
import type { FileDiffScope, FileMergeSidesResult, RepoScmSnapshot, RepoStatusEntry } from "@shared/ipc";

const DIFF_MERGE_CACHE_MAX = 24;

export type ScmMeta = { shortLabel: string; branch: string; lastCommitSubject: string | null };

export function useScmState(workspace: ReturnType<typeof useWorkspaceStore>) {
  /** `null` while checking the active worktree; `false` when the folder is not a Git repository. */
  const hasGitRepository = ref<boolean | null>(null);
  const repoStatus = ref<RepoStatusEntry[]>([]);
  const scmMeta = ref<ScmMeta>({ shortLabel: "", branch: "", lastCommitSubject: null });
  const selectedScmPath = ref<string | null>(null);
  const selectedScmScope = ref<FileDiffScope | null>(null);
  const selectedMergeResult = ref<FileMergeSidesResult | null>(null);
  const selectedDiffLoading = ref(false);
  const diffCache = new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX);

  let diffRefreshSeq = 0;
  let selectedDiffSeq = 0;

  function cacheKey(cwd: string, path: string, scope: FileDiffScope): string {
    return `${cwd}\0${scope}\0${path}`;
  }

  function normalizeRepoStatusResult(
    raw: RepoScmSnapshot | RepoStatusEntry[]
  ): { entries: RepoStatusEntry[]; meta: RepoScmSnapshot | null } {
    if (Array.isArray(raw)) {
      return { entries: raw, meta: null };
    }
    return { entries: raw.entries, meta: raw };
  }

  function applyRepoStatusSelection(status: RepoStatusEntry[]): void {
    const hasCurrentSelection =
      selectedScmPath.value &&
      selectedScmScope.value &&
      status.some((entry) => {
        if (entry.path !== selectedScmPath.value) return false;
        return selectedScmScope.value === "staged" ? Boolean(entry.stagedKind) : Boolean(entry.unstagedKind || entry.isUntracked);
      });
    if (hasCurrentSelection) return;

    const firstStaged = status.find((entry) => entry.stagedKind);
    if (firstStaged) {
      selectedScmPath.value = firstStaged.path;
      selectedScmScope.value = "staged";
      return;
    }
    const firstUnstaged = status.find((entry) => entry.unstagedKind || entry.isUntracked);
    selectedScmPath.value = firstUnstaged?.path ?? null;
    selectedScmScope.value = firstUnstaged ? "unstaged" : null;
  }

  function mergeSidesEqual(a: FileMergeSidesResult | null, b: FileMergeSidesResult): boolean {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === "ok" && b.kind === "ok") return a.original === b.original && a.modified === b.modified;
    if (a.kind === "error" && b.kind === "error") return a.message === b.message;
    return a.kind === "binary";
  }

  async function loadSelectedMerge(): Promise<void> {
    const api = window.workspaceApi ?? null;
    const path = selectedScmPath.value;
    const scope = selectedScmScope.value;
    if (!api || !workspace.activeWorktree || !path || !scope) {
      selectedMergeResult.value = null;
      selectedDiffLoading.value = false;
      return;
    }
    if (scope === "combined") {
      selectedMergeResult.value = {
        kind: "error",
        message: "Combined diff scope is not supported for merge view."
      };
      selectedDiffLoading.value = false;
      return;
    }
    const seq = ++selectedDiffSeq;
    const cwd = workspace.activeWorktree.path;
    const key = cacheKey(cwd, path, scope);
    const cached = diffCache.get(key);
    if (cached != null) {
      if (!mergeSidesEqual(selectedMergeResult.value, cached)) {
        selectedMergeResult.value = cached;
      }
      selectedDiffLoading.value = false;
      return;
    }
    if (!api.fileMergeSides) {
      selectedMergeResult.value = {
        kind: "error",
        message: "Update the desktop app to show merge diff in source control."
      };
      selectedDiffLoading.value = false;
      return;
    }
    // Only show the loading spinner when we have no existing content to display.
    // For background re-fetches (e.g. after a file save), keep the old diff visible.
    const hasExisting = selectedMergeResult.value !== null;
    if (!hasExisting) selectedDiffLoading.value = true;
    try {
      const result = await api.fileMergeSides(cwd, path, scope);
      if (seq !== selectedDiffSeq || workspace.activeWorktree?.path !== cwd) return;
      diffCache.set(key, result);
      if (!mergeSidesEqual(selectedMergeResult.value, result)) {
        selectedMergeResult.value = result;
      }
    } catch (error) {
      if (seq !== selectedDiffSeq || workspace.activeWorktree?.path !== cwd) return;
      selectedMergeResult.value = {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load diff."
      };
    } finally {
      if (seq === selectedDiffSeq) selectedDiffLoading.value = false;
    }
  }

  async function refreshRepoStatus(): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !workspace.activeWorktree) {
      hasGitRepository.value = null;
      repoStatus.value = [];
      scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
      selectedScmPath.value = null;
      selectedScmScope.value = null;
      selectedMergeResult.value = null;
      selectedDiffLoading.value = false;
      diffCache.clear();
      return;
    }
    const seq = ++diffRefreshSeq;
    const cwd = workspace.activeWorktree.path;

    if (api.isGitRepository) {
      let insideGit = false;
      try {
        insideGit = await api.isGitRepository(cwd);
      } catch {
        insideGit = false;
      }
      if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
      hasGitRepository.value = insideGit;
      if (!insideGit) {
        repoStatus.value = [];
        scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
        selectedScmPath.value = null;
        selectedScmScope.value = null;
        selectedMergeResult.value = null;
        selectedDiffLoading.value = false;
        diffCache.clear();
        return;
      }
    } else {
      if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
      hasGitRepository.value = true;
    }

    try {
      const rawStatus = api.repoStatus
        ? await api.repoStatus(cwd)
        : (await api.changedFiles(cwd)).map((path) => ({
            path,
            originalPath: null,
            stagedKind: null,
            unstagedKind: "modified" as const,
            isUntracked: false
          }));
      if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
      const { entries: statusEntries, meta } = normalizeRepoStatusResult(rawStatus);
      repoStatus.value = statusEntries;
      if (meta) {
        scmMeta.value = {
          shortLabel: meta.shortLabel,
          branch: meta.branch,
          lastCommitSubject: meta.lastCommitSubject
        };
      } else {
        scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
      }
      applyRepoStatusSelection(statusEntries);
      // Only evict the selected file's cache so it re-fetches fresh content;
      // other entries stay warm for quick switching between files.
      const selPath = selectedScmPath.value;
      const selScope = selectedScmScope.value;
      if (selPath && selScope) {
        diffCache.delete(cacheKey(cwd, selPath, selScope));
      }
      await loadSelectedMerge();
    } catch (error) {
      if (seq !== diffRefreshSeq || workspace.activeWorktree?.path !== cwd) return;
      repoStatus.value = [];
      scmMeta.value = { shortLabel: "", branch: "", lastCommitSubject: null };
      const message = error instanceof Error ? error.message : "";
      if (/not a git repository/i.test(message)) {
        hasGitRepository.value = false;
        selectedScmPath.value = null;
        selectedScmScope.value = null;
        selectedMergeResult.value = null;
      } else {
        selectedMergeResult.value = {
          kind: "error",
          message:
            error instanceof Error
              ? `Could not load source control status: ${error.message}`
              : "Could not load source control status."
        };
      }
      selectedDiffLoading.value = false;
    }
  }

  return {
    hasGitRepository,
    repoStatus,
    scmMeta,
    selectedScmPath,
    selectedScmScope,
    selectedMergeResult,
    selectedDiffLoading,
    diffCache,
    cacheKey,
    applyRepoStatusSelection,
    loadSelectedMerge,
    refreshRepoStatus
  };
}
