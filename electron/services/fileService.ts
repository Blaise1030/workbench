import fs from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist", "dist-electron"]);

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function assertPathWithinRoot(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, resolvedPath);

  if (
    relativeToRoot === "" ||
    (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  ) {
    return resolvedPath;
  }

  throw new Error("Path escapes the active worktree");
}

async function collectFiles(root: string, currentDir: string, output: string[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      await collectFiles(root, path.join(currentDir, entry.name), output);
      continue;
    }

    if (!entry.isFile()) continue;

    const absolutePath = path.join(currentDir, entry.name);
    output.push(normalizeRelativePath(path.relative(root, absolutePath)));
  }
}

export class FileService {
  async searchFiles(root: string, query: string): Promise<string[]> {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return [];

    const resolvedRoot = path.resolve(root);
    const allFiles: string[] = [];
    await collectFiles(resolvedRoot, resolvedRoot, allFiles);

    return allFiles
      .filter((relativePath) => relativePath.toLowerCase().includes(trimmedQuery))
      .sort((a, b) => a.localeCompare(b));
  }

  async readFile(root: string, relativePath: string): Promise<string> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    return fs.readFile(absolutePath, "utf8");
  }

  async writeFile(root: string, relativePath: string, content: string): Promise<void> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    await fs.writeFile(absolutePath, content, "utf8");
  }
}
