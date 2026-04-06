import Fuse from "fuse.js";
import type { Thread, ThreadAgent } from "@shared/domain";

export type LauncherSearchMode = "default" | "worktree";

export interface ParsedLauncherQuery {
  mode: LauncherSearchMode;
  /** Text after stripping `@wt` (and optional single space) in worktree mode. */
  query: string;
}

/**
 * `@wt` at start (case-sensitive) switches to worktree-only file search per design spec.
 * Strips one space after `@wt` when present.
 */
export function parseLauncherQuery(raw: string): ParsedLauncherQuery {
  if (raw.startsWith("@wt")) {
    let rest = raw.slice(3);
    if (rest.startsWith(" ")) rest = rest.slice(1);
    return { mode: "worktree", query: rest };
  }
  return { mode: "default", query: raw };
}

/** Result grouping for the launcher UI (Agents = threads, Files = active worktree, Workspace = other worktrees). */
export type LauncherSectionId = "agents" | "files" | "workspace";

export type LauncherRow =
  | { section: "agents"; kind: "thread"; id: string; title: string; agent: ThreadAgent; score: number }
  | {
      section: "files";
      kind: "file";
      relativePath: string;
      worktreeId: null;
      worktreeLabel: null;
      score: number;
    }
  | {
      section: "workspace";
      kind: "file";
      relativePath: string;
      worktreeId: string;
      worktreeLabel: string;
      score: number;
    };

const THREAD_FUSE: Fuse.IFuseOptions<{ id: string; title: string; agent: ThreadAgent }> = {
  keys: [
    { name: "title", weight: 0.7 },
    { name: "agent", weight: 0.3 }
  ],
  threshold: 0.38,
  includeScore: true,
  ignoreLocation: true
};

const FILE_FUSE: Fuse.IFuseOptions<{ relativePath: string }> = {
  keys: ["relativePath"],
  threshold: 0.38,
  includeScore: true,
  ignoreLocation: true
};

const WT_FILE_FUSE: Fuse.IFuseOptions<{
  relativePath: string;
  worktreeName: string;
}> = {
  keys: [
    { name: "relativePath", weight: 0.75 },
    { name: "worktreeName", weight: 0.25 }
  ],
  threshold: 0.38,
  includeScore: true,
  ignoreLocation: true
};

const MAX_THREAD_RESULTS = 10;
const MAX_BRANCH_FILE_RESULTS = 15;
const MAX_WORKTREE_FILE_RESULTS = 25;

function fuseScore(r: { score?: number }): number {
  return r.score ?? 1;
}

/**
 * Fuzzy search for the workspace launcher. Callers load file lists via IPC beforehand.
 */
export function searchLauncherRows(
  parsed: ParsedLauncherQuery,
  activeThreads: readonly Thread[],
  branchFiles: readonly { relativePath: string }[],
  /** Other worktrees in the same project (excludes active); each entry is pre-listed files. */
  otherWorktreeFiles: readonly { worktreeId: string; worktreeName: string; files: { relativePath: string }[] }[]
): LauncherRow[] {
  const q = parsed.query.trim();

  if (parsed.mode === "worktree") {
    if (!q) return [];
    const flat = otherWorktreeFiles.flatMap((wt) =>
      wt.files.map((f) => ({
        relativePath: f.relativePath,
        worktreeName: wt.worktreeName,
        worktreeId: wt.worktreeId
      }))
    );
    if (flat.length === 0) return [];
    const fuse = new Fuse(flat, WT_FILE_FUSE);
    return fuse.search(q, { limit: MAX_WORKTREE_FILE_RESULTS }).map((hit) => ({
      section: "workspace" as const,
      kind: "file" as const,
      relativePath: hit.item.relativePath,
      worktreeId: hit.item.worktreeId,
      worktreeLabel: hit.item.worktreeName,
      score: fuseScore(hit)
    }));
  }

  if (!q) return [];

  const rows: LauncherRow[] = [];

  const threadDocs = activeThreads.map((t) => ({
    id: t.id,
    title: t.title,
    agent: t.agent
  }));
  const tf = new Fuse(threadDocs, THREAD_FUSE);
  for (const hit of tf.search(q, { limit: MAX_THREAD_RESULTS })) {
    rows.push({
      section: "agents",
      kind: "thread",
      id: hit.item.id,
      title: hit.item.title,
      agent: hit.item.agent,
      score: fuseScore(hit)
    });
  }

  const ff = new Fuse(branchFiles, FILE_FUSE);
  for (const hit of ff.search(q, { limit: MAX_BRANCH_FILE_RESULTS })) {
    rows.push({
      section: "files",
      kind: "file",
      relativePath: hit.item.relativePath,
      worktreeId: null,
      worktreeLabel: null,
      score: fuseScore(hit)
    });
  }

  return rows;
}
