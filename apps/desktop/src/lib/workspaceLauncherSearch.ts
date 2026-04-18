import Fuse from "fuse.js";
import type { Project, Thread, ThreadAgent, Worktree } from "@shared/domain";

export type LauncherSearchMode = "default" | "worktree" | "threads" | "branches" | "files";

export interface ParsedLauncherQuery {
  mode: LauncherSearchMode;
  /** Text after stripping `@wt` (and optional single space) in worktree mode. */
  query: string;
}

/**
 * `@wt` at start (case-sensitive) switches to worktree-only file search per design spec.
 * Strips one space after `@wt` when present.
 */
const PREFIX_MAP: { prefix: string; mode: LauncherSearchMode }[] = [
  { prefix: "@wt", mode: "worktree" },
  { prefix: "@threads", mode: "threads" },
  { prefix: "@branches", mode: "branches" },
  { prefix: "@files", mode: "files" }
];

export function parseLauncherQuery(raw: string): ParsedLauncherQuery {
  for (const { prefix, mode } of PREFIX_MAP) {
    if (raw.startsWith(prefix)) {
      let rest = raw.slice(prefix.length);
      if (rest.startsWith(" ")) rest = rest.slice(1);
      return { mode, query: rest };
    }
  }
  return { mode: "default", query: raw };
}

/** Result grouping for the launcher UI (Agents = threads, Files = active worktree). */
export type LauncherSectionId =
  | "commands"
  | "workspace"
  | "worktrees"
  | "agents"
  | "files";

export const LAUNCHER_COMMAND_IDS = ["toggle-thread-sidebar"] as const;
export type LauncherCommandId = (typeof LAUNCHER_COMMAND_IDS)[number];

type CommandDoc = { id: LauncherCommandId; label: string; keywords: string };

const COMMAND_DOCS: readonly CommandDoc[] = [
  {
    id: "toggle-thread-sidebar",
    label: "Toggle threads sidebar",
    keywords: "sidebar threads collapse expand panel rail narrow strip icons hide show"
  }
];

const COMMAND_FUSE: Fuse.IFuseOptions<CommandDoc> = {
  keys: [
    { name: "label", weight: 0.65 },
    { name: "keywords", weight: 0.35 }
  ],
  threshold: 0.45,
  includeScore: true,
  ignoreLocation: true
};

export type LauncherRow =
  | {
      section: "commands";
      kind: "command";
      id: LauncherCommandId;
      label: string;
      shortcutHint: string;
      score: number;
    }
  | {
      section: "workspace";
      kind: "project";
      projectId: string;
      name: string;
      repoPath: string;
      score: number;
    }
  | {
      section: "worktrees";
      kind: "worktree";
      worktreeId: string;
      name: string;
      branch: string;
      score: number;
    }
  | { section: "agents"; kind: "thread"; id: string; title: string; agent: ThreadAgent; score: number }
  | {
      section: "files";
      kind: "file";
      relativePath: string;
      worktreeId: null;
      worktreeLabel: null;
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

const MAX_THREAD_RESULTS = 10;
const MAX_BRANCH_FILE_RESULTS = 15;
const MAX_PROJECT_RESULTS = 12;
const MAX_WORKTREE_SWITCH_RESULTS = 12;

function pathBasename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

const PROJECT_SWITCH_FUSE: Fuse.IFuseOptions<{
  projectId: string;
  name: string;
  repoPath: string;
  pathTail: string;
}> = {
  keys: [
    { name: "name", weight: 0.45 },
    { name: "repoPath", weight: 0.25 },
    { name: "pathTail", weight: 0.3 }
  ],
  threshold: 0.42,
  includeScore: true,
  ignoreLocation: true
};

const WORKTREE_SWITCH_FUSE: Fuse.IFuseOptions<{
  worktreeId: string;
  name: string;
  branch: string;
}> = {
  keys: [
    { name: "name", weight: 0.35 },
    { name: "branch", weight: 0.65 }
  ],
  threshold: 0.42,
  includeScore: true,
  ignoreLocation: true
};

function fuseScore(r: { score?: number }): number {
  return r.score ?? 1;
}

/**
 * Palette commands (sidebar, etc.). `commandSearchText` is the substring used for matching
 * (full query in default mode; text after `@wt` in worktree mode).
 */
export function searchLauncherCommands(
  commandSearchText: string,
  shortcutHints: Partial<Record<LauncherCommandId, string>>
): LauncherRow[] {
  const q = commandSearchText.trim();

  const mapHit = (doc: CommandDoc, score: number): LauncherRow => ({
    section: "commands",
    kind: "command",
    id: doc.id,
    label: doc.label,
    shortcutHint: shortcutHints[doc.id] ?? "",
    score
  });

  if (!q) {
    return COMMAND_DOCS.map((d) => mapHit(d, 0));
  }

  const fuse = new Fuse([...COMMAND_DOCS], COMMAND_FUSE);
  return fuse.search(q, { limit: 8 }).map((hit) => mapHit(hit.item, fuseScore(hit)));
}

/**
 * Other open workspaces (tabs) and other worktrees in the active project. Omitted in `@wt` file mode.
 */
export function searchLauncherWorkspaceSwitch(
  parsed: ParsedLauncherQuery,
  commandSearchText: string,
  projects: readonly Project[],
  activeProjectId: string | null,
  worktrees: readonly Worktree[],
  activeWorktreeId: string | null
): LauncherRow[] {
  if (parsed.mode !== "default" && parsed.mode !== "branches") return [];

  const q = commandSearchText.trim();

  const projectDocs = projects
    .filter((p) => p.id !== activeProjectId)
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      repoPath: p.repoPath,
      pathTail: pathBasename(p.repoPath)
    }));

  const worktreeDocs = worktrees
    .filter((w) => w.projectId === activeProjectId && w.id !== activeWorktreeId)
    .map((w) => ({
      worktreeId: w.id,
      name: w.name,
      branch: w.branch
    }));

  const out: LauncherRow[] = [];

  if (!q) {
    for (const p of projectDocs) {
      out.push({
        section: "workspace",
        kind: "project",
        projectId: p.projectId,
        name: p.name,
        repoPath: p.repoPath,
        score: 0
      });
    }
    for (const w of worktreeDocs) {
      out.push({
        section: "worktrees",
        kind: "worktree",
        worktreeId: w.worktreeId,
        name: w.name,
        branch: w.branch,
        score: 0
      });
    }
    return out;
  }

  if (projectDocs.length > 0) {
    const fuse = new Fuse(projectDocs, PROJECT_SWITCH_FUSE);
    for (const hit of fuse.search(q, { limit: MAX_PROJECT_RESULTS })) {
      const p = hit.item;
      out.push({
        section: "workspace",
        kind: "project",
        projectId: p.projectId,
        name: p.name,
        repoPath: p.repoPath,
        score: fuseScore(hit)
      });
    }
  }

  if (worktreeDocs.length > 0) {
    const fuse = new Fuse(worktreeDocs, WORKTREE_SWITCH_FUSE);
    for (const hit of fuse.search(q, { limit: MAX_WORKTREE_SWITCH_RESULTS })) {
      const w = hit.item;
      out.push({
        section: "worktrees",
        kind: "worktree",
        worktreeId: w.worktreeId,
        name: w.name,
        branch: w.branch,
        score: fuseScore(hit)
      });
    }
  }

  return out;
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
    void otherWorktreeFiles;
    if (!q) {
      return branchFiles.slice(0, MAX_BRANCH_FILE_RESULTS).map((f) => ({
        section: "files" as const,
        kind: "file" as const,
        relativePath: f.relativePath,
        worktreeId: null,
        worktreeLabel: null,
        score: 0
      }));
    }
    const fuse = new Fuse(branchFiles, FILE_FUSE);
    return fuse.search(q, { limit: MAX_BRANCH_FILE_RESULTS }).map((hit) => ({
      section: "files" as const,
      kind: "file" as const,
      relativePath: hit.item.relativePath,
      worktreeId: null,
      worktreeLabel: null,
      score: fuseScore(hit)
    }));
  }

  const includeThreads = parsed.mode === "default" || parsed.mode === "threads";
  const includeFiles = parsed.mode === "default" || parsed.mode === "files";

  // For scoped modes with no query, show defaults; for default mode, only show on query
  if (!q && parsed.mode === "default") return [];

  const rows: LauncherRow[] = [];

  if (includeThreads) {
    const threadDocs = activeThreads.map((t) => ({ id: t.id, title: t.title, agent: t.agent }));
    if (!q) {
      for (const t of threadDocs.slice(0, MAX_THREAD_RESULTS)) {
        rows.push({ section: "agents", kind: "thread", id: t.id, title: t.title, agent: t.agent, score: 0 });
      }
    } else {
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
    }
  }

  if (includeFiles) {
    if (!q) {
      for (const f of branchFiles.slice(0, MAX_BRANCH_FILE_RESULTS)) {
        rows.push({ section: "files", kind: "file", relativePath: f.relativePath, worktreeId: null, worktreeLabel: null, score: 0 });
      }
    } else {
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
    }
  }

  return rows;
}
