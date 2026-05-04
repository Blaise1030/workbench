import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@/composables/useToast";

export interface GitHubPr {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  user: { login: string; avatar_url: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  created_at: string;
  updated_at: string;
  comments: number;
  review_comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubPrComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  diff_hunk: string;
  side: "LEFT" | "RIGHT";
}

export interface ParsedFileDiff {
  oldFileName: string;
  newFileName: string;
  displayName: string;
  hunks: string[];
  isNewFile: boolean;
  isDeletedFile: boolean;
  additions: number;
  deletions: number;
}

function parsePrDiff(diff: string): ParsedFileDiff[] {
  const result: ParsedFileDiff[] = [];
  // Split on each "diff --git" marker
  const sections = diff.split(/(?=^diff --git )/m).filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.split("\n");
    let oldFileName = "";
    let newFileName = "";
    let isNewFile = false;
    let isDeletedFile = false;
    let additions = 0;
    let deletions = 0;
    const hunks: string[] = [];
    let currentHunkLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        const raw = line.slice(4).trim();
        oldFileName = raw === "/dev/null" ? "/dev/null" : raw.replace(/^a\//, "");
      } else if (line.startsWith("+++ ")) {
        const raw = line.slice(4).trim();
        newFileName = raw === "/dev/null" ? "/dev/null" : raw.replace(/^b\//, "");
      } else if (line === "new file mode 100644" || /^new file mode/.test(line)) {
        isNewFile = true;
      } else if (/^deleted file mode/.test(line)) {
        isDeletedFile = true;
      } else if (line.startsWith("@@ ")) {
        if (currentHunkLines.length > 0) {
          hunks.push(currentHunkLines.join("\n"));
        }
        currentHunkLines = [line];
        inHunk = true;
      } else if (inHunk) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
        currentHunkLines.push(line);
      }
    }

    if (currentHunkLines.length > 0) {
      hunks.push(currentHunkLines.join("\n"));
    }

    const effectiveName = newFileName !== "/dev/null" ? newFileName : oldFileName;
    if (effectiveName && hunks.length > 0) {
      result.push({
        oldFileName: oldFileName || "/dev/null",
        newFileName: newFileName || "/dev/null",
        displayName: effectiveName,
        hunks,
        isNewFile,
        isDeletedFile,
        additions,
        deletions,
      });
    }
  }

  return result;
}

const STORAGE_TOKEN_KEY = "instrument.githubToken";
const STORAGE_OWNER_KEY = "instrument.githubOwner";
const STORAGE_REPO_KEY = "instrument.githubRepo";

function readStorage(key: string): string {
  try {
    return typeof localStorage !== "undefined" ? (localStorage.getItem(key) ?? "") : "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export const useGitHubPrStore = defineStore("githubPr", () => {
  const toast = useToast();

  const githubToken = ref(readStorage(STORAGE_TOKEN_KEY));
  const repoOwner = ref(readStorage(STORAGE_OWNER_KEY));
  const repoName = ref(readStorage(STORAGE_REPO_KEY));

  const prs = ref<GitHubPr[]>([]);
  const selectedPrNumber = ref<number | null>(null);
  const parsedFiles = ref<ParsedFileDiff[]>([]);
  const selectedFileName = ref<string | null>(null);
  const prComments = ref<GitHubPrComment[]>([]);
  const loading = ref(false);
  const diffLoading = ref(false);
  const error = ref<string | null>(null);

  const isConfigured = computed(
    () => Boolean(githubToken.value) && Boolean(repoOwner.value) && Boolean(repoName.value)
  );

  const selectedPr = computed(() =>
    prs.value.find((p) => p.number === selectedPrNumber.value) ?? null
  );

  const selectedFileDiff = computed(
    () => parsedFiles.value.find((f) => f.displayName === selectedFileName.value) ?? null
  );

  const commentsForSelectedFile = computed(() => {
    const name = selectedFileName.value;
    if (!name) return [];
    return prComments.value.filter((c) => c.path === name);
  });

  function saveConfig(token: string, owner: string, repo: string): void {
    githubToken.value = token.trim();
    repoOwner.value = owner.trim();
    repoName.value = repo.trim();
    writeStorage(STORAGE_TOKEN_KEY, githubToken.value);
    writeStorage(STORAGE_OWNER_KEY, repoOwner.value);
    writeStorage(STORAGE_REPO_KEY, repoName.value);
  }

  function apiHeaders(acceptOverride?: string): Record<string, string> {
    return {
      Authorization: `Bearer ${githubToken.value}`,
      Accept: acceptOverride ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async function fetchPrs(): Promise<void> {
    if (!isConfigured.value) return;
    loading.value = true;
    error.value = null;
    try {
      const url = `https://api.github.com/repos/${repoOwner.value}/${repoName.value}/pulls?state=open&per_page=30`;
      const res = await fetch(url, { headers: apiHeaders() });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${msg}`);
      }
      prs.value = await res.json() as GitHubPr[];
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch PRs.";
      toast.error("Failed to load PRs", error.value);
    } finally {
      loading.value = false;
    }
  }

  async function selectPr(prNumber: number): Promise<void> {
    if (selectedPrNumber.value === prNumber) return;
    selectedPrNumber.value = prNumber;
    parsedFiles.value = [];
    selectedFileName.value = null;
    prComments.value = [];
    diffLoading.value = true;
    error.value = null;
    try {
      const [diffText, comments] = await Promise.all([
        fetchPrDiff(prNumber),
        fetchPrComments(prNumber),
      ]);
      parsedFiles.value = parsePrDiff(diffText);
      prComments.value = comments;
      if (parsedFiles.value.length > 0) {
        selectedFileName.value = parsedFiles.value[0]!.displayName;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load PR diff.";
      toast.error("Failed to load PR diff", error.value);
    } finally {
      diffLoading.value = false;
    }
  }

  async function fetchPrDiff(prNumber: number): Promise<string> {
    const url = `https://api.github.com/repos/${repoOwner.value}/${repoName.value}/pulls/${prNumber}`;
    const res = await fetch(url, { headers: apiHeaders("application/vnd.github.diff") });
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}`);
    }
    return res.text();
  }

  async function fetchPrComments(prNumber: number): Promise<GitHubPrComment[]> {
    const url = `https://api.github.com/repos/${repoOwner.value}/${repoName.value}/pulls/${prNumber}/comments?per_page=100`;
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}`);
    }
    return res.json() as Promise<GitHubPrComment[]>;
  }

  function clearPr(): void {
    selectedPrNumber.value = null;
    parsedFiles.value = [];
    selectedFileName.value = null;
    prComments.value = [];
    error.value = null;
  }

  return {
    githubToken,
    repoOwner,
    repoName,
    prs,
    selectedPrNumber,
    parsedFiles,
    selectedFileName,
    prComments,
    loading,
    diffLoading,
    error,
    isConfigured,
    selectedPr,
    selectedFileDiff,
    commentsForSelectedFile,
    saveConfig,
    fetchPrs,
    selectPr,
    clearPr,
  };
});
