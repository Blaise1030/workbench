import fs from "node:fs/promises";
import path from "node:path";
import type { FileSummary } from "../../src/shared/ipc.js";

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

async function collectFileSummaries(
  root: string,
  currentDir: string,
  output: FileSummary[]
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      const absoluteDir = path.join(currentDir, entry.name);
      const relDir = normalizeRelativePath(path.relative(root, absoluteDir));
      const dirStat = await fs.stat(absoluteDir);
      output.push({
        relativePath: relDir,
        size: 0,
        modifiedAt: dirStat.mtimeMs,
        kind: "directory"
      });
      await collectFileSummaries(root, absoluteDir, output);
      continue;
    }

    if (!entry.isFile()) continue;

    const absolutePath = path.join(currentDir, entry.name);
    const stat = await fs.stat(absolutePath);
    output.push({
      relativePath: normalizeRelativePath(path.relative(root, absolutePath)),
      size: stat.size,
      modifiedAt: stat.mtimeMs
    });
  }
}

export class FileService {
  async listFileSummaries(root: string): Promise<FileSummary[]> {
    const resolvedRoot = path.resolve(root);
    const summaries: FileSummary[] = [];
    await collectFileSummaries(resolvedRoot, resolvedRoot, summaries);
    summaries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return summaries;
  }

  async searchFiles(root: string, query: string): Promise<string[]> {
    const trimmedQuery = query.trim().toLowerCase();
    const allFiles = await this.listFileSummaries(root);
    if (!trimmedQuery) return allFiles.map((file) => file.relativePath);

    return allFiles
      .map((file) => file.relativePath)
      .filter((relativePath) => relativePath.toLowerCase().includes(trimmedQuery));
  }

  async readFile(root: string, relativePath: string): Promise<string> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    return fs.readFile(absolutePath, "utf8");
  }

  async writeFile(root: string, relativePath: string, content: string): Promise<void> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    await fs.writeFile(absolutePath, content, "utf8");
  }

  async createFile(root: string, relativePath: string): Promise<void> {
    const normalized = normalizeRelativePath(relativePath.trim()).replace(/^\/+/, "");
    if (!normalized || normalized.endsWith("/")) {
      throw new Error("Invalid file path");
    }

    const absolutePath = assertPathWithinRoot(root, normalized);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const handle = await fs.open(absolutePath, "wx");
    await handle.close();
  }

  async deleteFile(root: string, relativePath: string): Promise<void> {
    const normalized = normalizeRelativePath(relativePath.trim()).replace(/^\/+/, "");
    if (!normalized) {
      throw new Error("Invalid file path");
    }

    const absolutePath = assertPathWithinRoot(root, normalized);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error("Not a regular file");
    }
    await fs.unlink(absolutePath);
  }

  async createFolder(root: string, relativePath: string): Promise<void> {
    const normalized = normalizeRelativePath(relativePath.trim()).replace(/^\/+|\/+$/g, "");
    if (!normalized) {
      throw new Error("Invalid folder path");
    }

    const absolutePath = assertPathWithinRoot(root, normalized);

    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        throw new Error("Folder already exists");
      }
      throw new Error("A file exists at this path");
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "Folder already exists" || err.message === "A file exists at this path") {
          throw err;
        }
      }
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        await fs.mkdir(absolutePath, { recursive: true });
        return;
      }
      throw err;
    }
  }

  async deleteFolder(root: string, relativePath: string): Promise<void> {
    const normalized = normalizeRelativePath(relativePath.trim()).replace(/^\/+|\/+$/g, "");
    if (!normalized) {
      throw new Error("Invalid folder path");
    }

    const absolutePath = assertPathWithinRoot(root, normalized);
    const stat = await fs.stat(absolutePath);
    if (!stat.isDirectory()) {
      throw new Error("Not a folder");
    }
    await fs.rm(absolutePath, { recursive: true, force: true });
  }
}
