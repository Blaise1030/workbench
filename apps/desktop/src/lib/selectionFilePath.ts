import type { FileSummary } from "@shared/ipc";

type FileListApi = Pick<WorkspaceApi, "listFiles">;

const filePathSetCache = new Map<string, Promise<Set<string>>>();

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function trimToken(token: string): string {
  return token
    .trim()
    .replace(/^[`"'([{<]+/, "")
    .replace(/[`"',.;:!?)\]}>]+$/, "");
}

function stripLineSuffix(token: string): string {
  return token.replace(/:\d+(?::\d+)?$/, "");
}

function toRelativeWorkspacePath(token: string, cwd: string): string | null {
  const normalizedCwd = normalizeSlashes(cwd).replace(/\/+$/, "");
  let candidate = normalizeSlashes(stripLineSuffix(trimToken(token))).replace(/^\.\/+/, "");
  if (!candidate || candidate.includes("://") || candidate.startsWith("~/")) return null;

  if (/^[A-Za-z]:\//.test(candidate)) {
    const cwdLower = normalizedCwd.toLowerCase();
    const candidateLower = candidate.toLowerCase();
    if (candidateLower === cwdLower || !candidateLower.startsWith(`${cwdLower}/`)) return null;
    candidate = candidate.slice(normalizedCwd.length + 1);
  } else if (candidate.startsWith("/")) {
    if (candidate === normalizedCwd || !candidate.startsWith(`${normalizedCwd}/`)) return null;
    candidate = candidate.slice(normalizedCwd.length + 1);
  }

  candidate = candidate.replace(/^\/+/, "");
  if (!candidate || candidate.endsWith("/")) return null;
  if (candidate === "." || candidate === "..") return null;
  if (candidate.startsWith("../") || candidate.includes("/../")) return null;
  return candidate;
}

export function extractSelectionFilePathCandidates(selection: string, cwd: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const normalized = normalizeSlashes(selection);
  const tokens = normalized.match(/(?:[A-Za-z]:\/|\/|\.\.?\/)?[^\s"'`<>()\[\]{}]+/g) ?? [];

  for (const raw of tokens) {
    const candidate = toRelativeWorkspacePath(raw, cwd);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

function fileSetFromSummaries(files: FileSummary[]): Set<string> {
  const out = new Set<string>();
  for (const file of files) {
    if (file.kind !== "file") continue;
    out.add(normalizeSlashes(file.relativePath));
  }
  return out;
}

async function workspaceFilePathSet(api: FileListApi, cwd: string): Promise<Set<string>> {
  let cached = filePathSetCache.get(cwd);
  if (!cached) {
    cached = api.listFiles(cwd).then((files) => fileSetFromSummaries(files));
    filePathSetCache.set(cwd, cached);
  }
  return cached;
}

export async function resolveSelectionFilePath(
  api: FileListApi | null | undefined,
  cwd: string | null | undefined,
  selection: string
): Promise<string | null> {
  if (!api || !cwd) return null;
  const candidates = extractSelectionFilePathCandidates(selection, cwd);
  if (candidates.length === 0) return null;
  const files = await workspaceFilePathSet(api, cwd);
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}
