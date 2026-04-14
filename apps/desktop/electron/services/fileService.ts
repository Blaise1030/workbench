import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileSummary } from "../../src/shared/ipc.js";
import { assertPathWithinRoot } from "../utils/pathGuard.js";

const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist", "dist-electron"]);

/** Extensions we do not scan for substring matches (binary or non-text assets). */
const CONTENT_SEARCH_SKIP_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "zip",
  "gz",
  "tgz",
  "rar",
  "7z",
  "bz2",
  "xz",
  "br",
  "pdf",
  "mp3",
  "mp4",
  "m4a",
  "webm",
  "ogg",
  "mov",
  "mkv",
  "wav",
  "sqlite",
  "db",
  "wasm",
  "so",
  "dylib",
  "dll",
  "exe",
  "jar",
  "class"
]);

/** Workspace-relative images resolved to `data:` URLs (works when the renderer is `http://`, unlike `file://`). */
const IMAGE_FILE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif"
]);

function mimeTypeForImageExtension(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function isPathWithinParent(child: string, parent: string): boolean {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  if (c === p) return true;
  const rel = path.relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** macOS screencapture, browser downloads, etc. — not arbitrary filesystem paths. */
function allowedExternalImageRootDirs(): string[] {
  const home = os.homedir();
  const roots = new Set<string>();
  roots.add(path.resolve(os.tmpdir()));
  for (const tail of ["Desktop", "Downloads", "Pictures", "Movies", "Music"]) {
    roots.add(path.resolve(path.join(home, tail)));
  }
  return [...roots];
}

function isAllowedExternalImagePath(resolvedPath: string): boolean {
  const normalized = path.resolve(resolvedPath);
  return allowedExternalImageRootDirs().some((d) => isPathWithinParent(normalized, d));
}

function isLikelyGitLfsPointer(buf: Buffer): boolean {
  if (buf.length < 20) return false;
  const head = buf.subarray(0, 80).toString("utf8");
  return head.includes("git-lfs.github.com/spec/");
}

function isPlausibleDecodedImage(buf: Buffer, ext: string): boolean {
  if (buf.length === 0) return false;
  if (isLikelyGitLfsPointer(buf)) return false;
  switch (ext) {
    case "png":
      return (
        buf.length >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );
    case "jpg":
    case "jpeg":
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "gif":
      return buf.length >= 6 && buf.slice(0, 4).toString("ascii") === "GIF8";
    case "webp":
      return (
        buf.length >= 12 &&
        buf.slice(0, 4).toString("ascii") === "RIFF" &&
        buf.slice(8, 12).toString("ascii") === "WEBP"
      );
    case "bmp":
      return buf.length >= 2 && buf.slice(0, 2).toString("ascii") === "BM";
    case "ico":
      return buf.length >= 4;
    case "svg": {
      const t = buf.subarray(0, Math.min(256, buf.length)).toString("utf8").trimStart();
      return t.startsWith("<") || t.startsWith("<?xml");
    }
    case "avif": {
      if (buf.length < 16) return false;
      const brand = buf.slice(8, 16).toString("ascii");
      return buf.slice(4, 8).toString("ascii") === "ftyp" && /avif|mif1|miaf|MA1A|MA1B/i.test(brand);
    }
    default:
      return false;
  }
}


const CONTENT_SEARCH_CONCURRENCY = 16;

async function searchFileContentsBatch(
  resolvedRoot: string,
  relativePaths: readonly string[],
  trimmedQueryLower: string,
  maxBytes: number
): Promise<string[]> {
  const matches: string[] = [];

  const scanOne = async (relativePath: string): Promise<string | undefined> => {
    const ext = path.extname(relativePath).slice(1).toLowerCase();
    if (ext && CONTENT_SEARCH_SKIP_EXTENSIONS.has(ext)) return undefined;

    const absolutePath = assertPathWithinRoot(resolvedRoot, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.size > maxBytes) return undefined;

      const buf = await fs.readFile(absolutePath);
      if (buf.includes(0)) return undefined;
      const text = buf.toString("utf8");
      if (text.toLowerCase().includes(trimmedQueryLower)) {
        return relativePath;
      }
    } catch {
      /* unreadable or race — skip */
    }
    return undefined;
  };

  for (let i = 0; i < relativePaths.length; i += CONTENT_SEARCH_CONCURRENCY) {
    const chunk = relativePaths.slice(i, i + CONTENT_SEARCH_CONCURRENCY);
    const hits = await Promise.all(chunk.map((rp) => scanOne(rp)));
    for (const h of hits) {
      if (h) matches.push(h);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  matches.sort((a, b) => a.localeCompare(b));
  return matches;
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
    /** Yield so huge workspaces do not block the Electron main process indefinitely. */
    if (output.length > 0 && output.length % 384 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
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
  private readonly imageDataUrlCache = new Map<string, { mtimeMs: number; url: string }>();

  /** Cap size for inlining images as `data:` URLs (Markdown + image preview). */
  private static readonly MAX_IMAGE_DATA_URL_BYTES = 32 * 1024 * 1024;

  /**
   * Shared workspace file tree index: used by `searchFiles`, the `files:list` IPC (Files pane +
   * workspace launcher), so we scan each root once per TTL instead of duplicating full walks.
   * Bump `searchFilesSummaryGeneration` on writes so the cache cannot serve stale paths.
   */
  private static readonly SEARCH_FILES_SUMMARY_TTL_MS = 45_000;
  private readonly searchFilesSummaryCache = new Map<
    string,
    { generation: number; cachedAtMs: number; summaries: FileSummary[] }
  >();
  private readonly searchFilesSummaryInflight = new Map<string, Promise<FileSummary[]>>();
  private readonly searchFilesSummaryGeneration = new Map<string, number>();

  private invalidateSearchFilesSummaryCache(root: string): void {
    const key = path.resolve(root);
    this.searchFilesSummaryCache.delete(key);
    this.searchFilesSummaryGeneration.set(key, (this.searchFilesSummaryGeneration.get(key) ?? 0) + 1);
  }

  private generationForSearchFilesSummary(rootKey: string): number {
    return this.searchFilesSummaryGeneration.get(rootKey) ?? 0;
  }

  /**
   * Cached/coalesced `listFileSummaries` for a root. Prefer this for UI that only needs the
   * current tree snapshot (`files:list`, @-mention path search).
   */
  async listFileSummariesCached(root: string): Promise<FileSummary[]> {
    const key = path.resolve(root);
    const now = Date.now();
    const gen = this.generationForSearchFilesSummary(key);
    const hit = this.searchFilesSummaryCache.get(key);
    if (
      hit &&
      hit.generation === gen &&
      now - hit.cachedAtMs < FileService.SEARCH_FILES_SUMMARY_TTL_MS
    ) {
      return hit.summaries;
    }

    let inflight = this.searchFilesSummaryInflight.get(key);
    if (!inflight) {
      const startGen = this.generationForSearchFilesSummary(key);
      inflight = (async () => {
        try {
          let summaries = await this.listFileSummaries(key);
          if (this.generationForSearchFilesSummary(key) !== startGen) {
            summaries = await this.listFileSummaries(key);
          }
          const endGen = this.generationForSearchFilesSummary(key);
          this.searchFilesSummaryCache.set(key, {
            generation: endGen,
            cachedAtMs: Date.now(),
            summaries
          });
          return summaries;
        } finally {
          this.searchFilesSummaryInflight.delete(key);
        }
      })();
      this.searchFilesSummaryInflight.set(key, inflight);
    }
    return inflight;
  }

  async listFileSummaries(root: string): Promise<FileSummary[]> {
    const resolvedRoot = path.resolve(root);
    const summaries: FileSummary[] = [];
    await collectFileSummaries(resolvedRoot, resolvedRoot, summaries);
    summaries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return summaries;
  }

  async searchFiles(root: string, query: string): Promise<string[]> {
    const trimmedQuery = query.trim().toLowerCase();
    const allFiles = await this.listFileSummariesCached(root);
    if (!trimmedQuery) return allFiles.map((file) => file.relativePath);

    return allFiles
      .map((file) => file.relativePath)
      .filter((relativePath) => relativePath.toLowerCase().includes(trimmedQuery));
  }

  /** Max bytes read per file when scanning for substring matches (skip larger files). */
  private static readonly MAX_CONTENT_SEARCH_BYTES = 2 * 1024 * 1024;

  /**
   * Returns relative paths of **files** whose UTF-8 text contains `query` (case-insensitive).
   * Skips directories, binary files (null bytes), and files larger than `MAX_CONTENT_SEARCH_BYTES`.
   */
  async searchFileContents(root: string, query: string): Promise<string[]> {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return [];

    const resolvedRoot = path.resolve(root);
    /** File paths only — avoids stat+summary work for every directory like `listFileSummaries`. */
    const relativePaths: string[] = [];
    await collectFiles(resolvedRoot, resolvedRoot, relativePaths);
    return searchFileContentsBatch(
      resolvedRoot,
      relativePaths,
      trimmedQuery,
      FileService.MAX_CONTENT_SEARCH_BYTES
    );
  }

  async readFile(root: string, relativePath: string): Promise<string> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    return fs.readFile(absolutePath, "utf8");
  }

  /**
   * Reads a workspace image as a `data:` URL so `<img src>` works when the UI is loaded from `http://`
   * (Chromium blocks `file://` subresources from non-file origins).
   */
  private async readWorkspaceImageAsDataUrl(root: string, relativePath: string): Promise<string | null> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    const ext = path.extname(relativePath).slice(1).toLowerCase();
    if (!IMAGE_FILE_EXTENSIONS.has(ext)) return null;

    const stat = await fs.stat(absolutePath);
    if (!stat.isFile() || stat.size > FileService.MAX_IMAGE_DATA_URL_BYTES) return null;

    const cached = this.imageDataUrlCache.get(absolutePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.url;

    const buf = await fs.readFile(absolutePath);
    if (!isPlausibleDecodedImage(buf, ext)) return null;

    const mime = mimeTypeForImageExtension(ext);
    const url = `data:${mime};base64,${buf.toString("base64")}`;
    this.imageDataUrlCache.set(absolutePath, { mtimeMs: stat.mtimeMs, url });
    return url;
  }

  /**
   * Reads an image from an absolute path outside the worktree (e.g. macOS `…/TemporaryItems/…/*.png`).
   * Restricted to temp + common user media directories under the home folder.
   */
  async readImageDataUrlFromAbsolutePath(absolutePath: string): Promise<string | null> {
    const trimmed = absolutePath.trim();
    if (!trimmed || !path.isAbsolute(trimmed)) return null;
    const resolved = path.resolve(trimmed);
    if (!isAllowedExternalImagePath(resolved)) return null;

    const ext = path.extname(resolved).slice(1).toLowerCase();
    if (!IMAGE_FILE_EXTENSIONS.has(ext)) return null;

    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      return null;
    }
    if (!stat.isFile() || stat.size > FileService.MAX_IMAGE_DATA_URL_BYTES) return null;

    const buf = await fs.readFile(resolved);
    if (!isPlausibleDecodedImage(buf, ext)) return null;

    const mime = mimeTypeForImageExtension(ext);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  /**
   * Returns a URL suitable for `<img src>`: passes through `https?` and `data:`; resolves workspace-relative
   * paths to a `data:` URL (see `readWorkspaceImageAsDataUrl`). Returns `null` if the href is empty, escapes the
   * worktree, is not a supported image type, or is too large.
   */
  async resolveMarkdownImageUrl(
    root: string,
    markdownRelativePath: string,
    href: string
  ): Promise<string | null> {
    const trimmed = href.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:")) {
      return trimmed;
    }
    if (lower.startsWith("//")) return null;

    let pathPart = trimmed.replace(/^<|>$/g, "");
    const hashIdx = pathPart.indexOf("#");
    if (hashIdx >= 0) pathPart = pathPart.slice(0, hashIdx);
    pathPart = pathPart.trim();
    if (!pathPart) return null;

    const normalizedMd = normalizeRelativePath(markdownRelativePath);
    const baseDir = path.dirname(normalizedMd);
    const joined = path.normalize(path.join(baseDir, pathPart)).replace(/\\/g, "/");
    const relative = joined.replace(/^\/+/, "");
    if (!relative) return null;

    try {
      return await this.readWorkspaceImageAsDataUrl(root, relative);
    } catch {
      return null;
    }
  }

  async writeFile(root: string, relativePath: string, content: string): Promise<void> {
    const absolutePath = assertPathWithinRoot(root, relativePath);
    await fs.writeFile(absolutePath, content, "utf8");
    this.invalidateSearchFilesSummaryCache(root);
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
    this.invalidateSearchFilesSummaryCache(root);
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
    this.invalidateSearchFilesSummaryCache(root);
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
        this.invalidateSearchFilesSummaryCache(root);
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
    this.invalidateSearchFilesSummaryCache(root);
  }
}
