import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { defineStore } from "pinia";
import { LruMap } from "@/lib/lruMap";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useToast } from "@/composables/useToast";
import { decodeBranch } from "@/router/branchParam";
import type { FileDiffScope, FileMergeSidesResult, RepoScmSnapshot, RepoStatusEntry } from "@shared/ipc";

const DIFF_MERGE_CACHE_MAX = 24;

export type ScmMeta = { shortLabel: string; branch: string; lastCommitSubject: string | null };

export const useScmStore = defineStore("scm", () => {
  const route = useRoute();
  const workspace = useWorkspaceStore();
  const toast = useToast();

  const activeWorktree = computed(() => {
    const projectId = route.params.projectId;
    const branch = route.params.branch;
    if (typeof projectId !== "string" || typeof branch !== "string") return undefined;
    const decoded = decodeBranch(branch);
    return workspace.worktrees.find((w) => w.projectId === projectId && w.branch === decoded);
  });

  // ── State ────────────────────────────────────────────────────────────────
  const hasGitRepository = ref<boolean | null>(null);
  const repoStatus = ref<RepoStatusEntry[]>([]);
  const scmMeta = ref<ScmMeta>({ shortLabel: "", branch: "", lastCommitSubject: null });
  const selectedScmPath = ref<string | null>(null);
  const selectedScmScope = ref<FileDiffScope | null>(null);
  const selectedMergeResult = ref<FileMergeSidesResult | null>(null);
  const selectedDiffLoading = ref(false);
  const diffCache = new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX);

  const scmCommitMessage = ref("");
  const scmFetchBusy = ref(false);
  const scmPushBusy = ref(false);
  const scmCommitBusy = ref(false);

  let diffRefreshSeq = 0;
  let selectedDiffSeq = 0;

  // ── Internal helpers ─────────────────────────────────────────────────────
  function cacheKey(cwd: string, path: string, scope: FileDiffScope): string {
    return `${cwd}\0${scope}\0${path}`;
  }

  function normalizeRepoStatusResult(
    raw: RepoScmSnapshot | RepoStatusEntry[]
  ): { entries: RepoStatusEntry[]; meta: RepoScmSnapshot | null } {
    if (Array.isArray(raw)) return { entries: raw, meta: null };
    return { entries: raw.entries, meta: raw };
  }

  function mergeSidesEqual(a: FileMergeSidesResult | null, b: FileMergeSidesResult): boolean {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === "ok" && b.kind === "ok") return a.original === b.original && a.modified === b.modified;
    if (a.kind === "error" && b.kind === "error") return a.message === b.message;
    return a.kind === "binary";
  }

  function applyRepoStatusSelection(status: RepoStatusEntry[]): void {
    const hasCurrentSelection =
      selectedScmPath.value &&
      selectedScmScope.value &&
      status.some((entry) => {
        if (entry.path !== selectedScmPath.value) return false;
        return selectedScmScope.value === "staged"
          ? Boolean(entry.stagedKind)
          : Boolean(entry.unstagedKind || entry.isUntracked);
      });
    if (hasCurrentSelection) return;

    const firstStaged = status.find((e) => e.stagedKind);
    if (firstStaged) {
      selectedScmPath.value = firstStaged.path;
      selectedScmScope.value = "staged";
      return;
    }
    const firstUnstaged = status.find((e) => e.unstagedKind || e.isUntracked);
    selectedScmPath.value = firstUnstaged?.path ?? null;
    selectedScmScope.value = firstUnstaged ? "unstaged" : null;
  }

  // ── Core SCM actions ─────────────────────────────────────────────────────
  async function loadSelectedMerge(): Promise<void> {
    const api = window.workspaceApi ?? null;
    const path = selectedScmPath.value;
    const scope = selectedScmScope.value;
    if (!api || !activeWorktree.value || !path || !scope) {
      selectedMergeResult.value = null;
      selectedDiffLoading.value = false;
      return;
    }
    if (scope === "combined") {
      selectedMergeResult.value = { kind: "error", message: "Combined diff scope is not supported for merge view." };
      selectedDiffLoading.value = false;
      return;
    }
    const seq = ++selectedDiffSeq;
    const cwd = activeWorktree.value.path;
    const key = cacheKey(cwd, path, scope);
    const cached = diffCache.get(key);
    if (cached != null) {
      if (!mergeSidesEqual(selectedMergeResult.value, cached)) selectedMergeResult.value = cached;
      selectedDiffLoading.value = false;
      return;
    }
    if (!api.fileMergeSides) {
      selectedMergeResult.value = { kind: "error", message: "Update the desktop app to show merge diff in source control." };
      selectedDiffLoading.value = false;
      return;
    }
    const hasExisting = selectedMergeResult.value !== null;
    if (!hasExisting) selectedDiffLoading.value = true;
    try {
      const result = await api.fileMergeSides(cwd, path, scope);
      if (seq !== selectedDiffSeq || activeWorktree.value?.path !== cwd) return;
      diffCache.set(key, result);
      if (!mergeSidesEqual(selectedMergeResult.value, result)) selectedMergeResult.value = result;
    } catch (error) {
      if (seq !== selectedDiffSeq || activeWorktree.value?.path !== cwd) return;
      selectedMergeResult.value = { kind: "error", message: error instanceof Error ? error.message : "Could not load diff." };
    } finally {
      if (seq === selectedDiffSeq) selectedDiffLoading.value = false;
    }
  }

  async function refreshRepoStatus(): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value) {
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
    const cwd = activeWorktree.value.path;

    if (api.isGitRepository) {
      let insideGit = false;
      try { insideGit = await api.isGitRepository(cwd); } catch { insideGit = false; }
      if (seq !== diffRefreshSeq || activeWorktree.value?.path !== cwd) return;
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
      if (seq !== diffRefreshSeq || activeWorktree.value?.path !== cwd) return;
      hasGitRepository.value = true;
    }

    try {
      const rawStatus = api.repoStatus
        ? await api.repoStatus(cwd)
        : (await api.changedFiles(cwd)).map((path) => ({
            path, originalPath: null, stagedKind: null,
            unstagedKind: "modified" as const, isUntracked: false
          }));
      if (seq !== diffRefreshSeq || activeWorktree.value?.path !== cwd) return;
      const { entries: statusEntries, meta } = normalizeRepoStatusResult(rawStatus);
      repoStatus.value = statusEntries;
      scmMeta.value = meta
        ? { shortLabel: meta.shortLabel, branch: meta.branch, lastCommitSubject: meta.lastCommitSubject }
        : { shortLabel: "", branch: "", lastCommitSubject: null };
      applyRepoStatusSelection(statusEntries);
      const selPath = selectedScmPath.value;
      const selScope = selectedScmScope.value;
      if (selPath && selScope) diffCache.delete(cacheKey(cwd, selPath, selScope));
      await loadSelectedMerge();
    } catch (error) {
      if (seq !== diffRefreshSeq || activeWorktree.value?.path !== cwd) return;
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
          message: error instanceof Error ? `Could not load source control status: ${error.message}` : "Could not load source control status."
        };
      }
      selectedDiffLoading.value = false;
    }
  }

  function selectScmEntry(payload: { path: string; scope: "staged" | "unstaged" }): void {
    selectedScmPath.value = payload.path;
    selectedScmScope.value = payload.scope;
    void loadSelectedMerge();
  }

  async function stageSelected(paths: string[]): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value || paths.length === 0) return;
    if (api.stagePaths) {
      await api.stagePaths(activeWorktree.value.path, paths);
    } else {
      await api.stageAll(activeWorktree.value.path);
    }
    await refreshRepoStatus();
  }

  async function unstageSelected(paths: string[]): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value || paths.length === 0) return;
    if (!api.unstagePaths) {
      toast.error("Cannot unstage selection", "Restart the desktop app so per-file unstage is available.");
      return;
    }
    await api.unstagePaths(activeWorktree.value.path, paths);
    await refreshRepoStatus();
  }

  async function discardSelected(paths: string[]): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value || paths.length === 0) return;
    if (!api.discardPaths) {
      toast.error("Cannot discard selection", "Restart the desktop app so per-file discard is available, or discard from the terminal.");
      return;
    }
    const label = paths.length === 1 ? paths[0]! : `${paths.length} files`;
    const confirmed = window.confirm(`Discard changes to ${label}?`);
    if (!confirmed) return;
    await api.discardPaths(activeWorktree.value.path, paths);
    await refreshRepoStatus();
  }

  async function stageAll(): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value) return;
    await api.stageAll(activeWorktree.value.path);
    await refreshRepoStatus();
  }

  async function unstageAll(): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value) return;
    if (!api.unstageAll) {
      toast.error("Cannot unstage all", "Restart the desktop app so unstage-all is available.");
      return;
    }
    await api.unstageAll(activeWorktree.value.path);
    await refreshRepoStatus();
  }

  async function discardAll(): Promise<void> {
    const api = window.workspaceApi ?? null;
    if (!api || !activeWorktree.value) return;
    const confirmed = window.confirm("Discard all working tree changes?");
    if (!confirmed) return;
    await api.discardAll(activeWorktree.value.path);
    await refreshRepoStatus();
  }

  async function scmFetch(): Promise<void> {
    const api = window.workspaceApi ?? null;
    const cwd = activeWorktree.value?.path;
    if (!api?.gitFetch || !cwd) return;
    scmFetchBusy.value = true;
    try {
      await api.gitFetch(cwd);
      await refreshRepoStatus();
    } catch (e) {
      toast.error("Fetch failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      scmFetchBusy.value = false;
    }
  }

  async function scmPush(): Promise<void> {
    const api = window.workspaceApi ?? null;
    const cwd = activeWorktree.value?.path;
    if (!api?.gitPush || !cwd) return;
    scmPushBusy.value = true;
    try {
      await api.gitPush(cwd);
      await refreshRepoStatus();
      toast.success("Push succeeded", `Branch \`${scmMeta.value.branch}\` was pushed to the remote.`);
    } catch (e) {
      toast.error("Push failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      scmPushBusy.value = false;
    }
  }

  async function scmCommit(): Promise<void> {
    const message = scmCommitMessage.value.trim();
    if (!message) return;
    const api = window.workspaceApi ?? null;
    const cwd = activeWorktree.value?.path;
    if (!api?.commitStaged || !cwd) {
      toast.error("Commit unavailable", "Commit from the UI requires the desktop app with an up-to-date build, or use git commit in the terminal.");
      return;
    }
    scmCommitBusy.value = true;
    try {
      await api.commitStaged(cwd, message);
      scmCommitMessage.value = "";
      await refreshRepoStatus();
    } catch (e) {
      toast.error("Commit failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      scmCommitBusy.value = false;
    }
  }

  return {
    // state
    hasGitRepository,
    repoStatus,
    scmMeta,
    selectedScmPath,
    selectedScmScope,
    selectedMergeResult,
    selectedDiffLoading,
    diffCache,
    scmCommitMessage,
    scmFetchBusy,
    scmPushBusy,
    scmCommitBusy,
    // actions
    refreshRepoStatus,
    loadSelectedMerge,
    selectScmEntry,
    stageSelected,
    unstageSelected,
    discardSelected,
    stageAll,
    unstageAll,
    discardAll,
    scmFetch,
    scmPush,
    scmCommit,
    applyRepoStatusSelection,
    cacheKey
  };
});
