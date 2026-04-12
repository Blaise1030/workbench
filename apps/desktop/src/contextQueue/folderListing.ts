import type { FileSummary } from "@shared/ipc";

export type FolderListingOptions = {
  maxDepth: number;
  maxEntries: number;
};

const DEFAULT_OPTS: FolderListingOptions = { maxDepth: 2, maxEntries: 50 };

function depthFromFolder(folderRel: string, fileRel: string): number {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const f = norm(folderRel);
  const p = norm(fileRel);
  if (!p.startsWith(f === "" ? "" : f + "/") && f !== "") return Infinity;
  const rest = f === "" ? p : p.slice(f.length + 1);
  if (rest === "") return 0;
  return rest.split("/").filter(Boolean).length;
}

/**
 * Build bounded plain-text listing of files under `folderRelPath` (relative to worktree)
 * using a flat `listFiles(worktreeRoot)` result.
 */
export function formatFolderListingFromFiles(
  folderRelPath: string,
  files: FileSummary[],
  opts: FolderListingOptions = DEFAULT_OPTS
): string {
  const folder = folderRelPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const prefix = folder === "" ? "" : folder + "/";

  const lines: string[] = [];
  for (const f of files) {
    const rel = f.relativePath.replace(/\\/g, "/");
    if (folder !== "" && !rel.startsWith(prefix) && rel !== folder) continue;
    if (folder !== "" && rel === folder) continue;
    const d = depthFromFolder(folder, rel);
    if (d === Infinity || d > opts.maxDepth) continue;
    const display = folder === "" ? rel : rel.slice(prefix.length);
    lines.push(display);
    if (lines.length >= opts.maxEntries) {
      lines.push("… (truncated)");
      break;
    }
  }

  if (lines.length === 0) {
    return "(no files listed under this path)";
  }
  return lines.join("\n");
}
