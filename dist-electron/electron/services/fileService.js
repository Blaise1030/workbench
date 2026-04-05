"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist", "dist-electron"]);
function normalizeRelativePath(relativePath) {
    return relativePath.replace(/\\/g, "/");
}
function assertPathWithinRoot(root, relativePath) {
    const resolvedRoot = node_path_1.default.resolve(root);
    const resolvedPath = node_path_1.default.resolve(resolvedRoot, relativePath);
    const relativeToRoot = node_path_1.default.relative(resolvedRoot, resolvedPath);
    if (relativeToRoot === "" ||
        (!relativeToRoot.startsWith("..") && !node_path_1.default.isAbsolute(relativeToRoot))) {
        return resolvedPath;
    }
    throw new Error("Path escapes the active worktree");
}
async function collectFiles(root, currentDir, output) {
    const entries = await promises_1.default.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORY_NAMES.has(entry.name))
                continue;
            await collectFiles(root, node_path_1.default.join(currentDir, entry.name), output);
            continue;
        }
        if (!entry.isFile())
            continue;
        const absolutePath = node_path_1.default.join(currentDir, entry.name);
        output.push(normalizeRelativePath(node_path_1.default.relative(root, absolutePath)));
    }
}
async function collectFileSummaries(root, currentDir, output) {
    const entries = await promises_1.default.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORY_NAMES.has(entry.name))
                continue;
            await collectFileSummaries(root, node_path_1.default.join(currentDir, entry.name), output);
            continue;
        }
        if (!entry.isFile())
            continue;
        const absolutePath = node_path_1.default.join(currentDir, entry.name);
        const stat = await promises_1.default.stat(absolutePath);
        output.push({
            relativePath: normalizeRelativePath(node_path_1.default.relative(root, absolutePath)),
            size: stat.size,
            modifiedAt: stat.mtimeMs
        });
    }
}
class FileService {
    summaryCache = new Map();
    async listFileSummaries(root) {
        const resolvedRoot = node_path_1.default.resolve(root);
        const cached = this.summaryCache.get(resolvedRoot);
        if (cached)
            return cached;
        const summaries = [];
        await collectFileSummaries(resolvedRoot, resolvedRoot, summaries);
        summaries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        this.summaryCache.set(resolvedRoot, summaries);
        return summaries;
    }
    async searchFiles(root, query) {
        const trimmedQuery = query.trim().toLowerCase();
        const allFiles = await this.listFileSummaries(root);
        if (!trimmedQuery)
            return allFiles.map((file) => file.relativePath);
        return allFiles
            .map((file) => file.relativePath)
            .filter((relativePath) => relativePath.toLowerCase().includes(trimmedQuery));
    }
    async readFile(root, relativePath) {
        const absolutePath = assertPathWithinRoot(root, relativePath);
        return promises_1.default.readFile(absolutePath, "utf8");
    }
    async writeFile(root, relativePath, content) {
        const absolutePath = assertPathWithinRoot(root, relativePath);
        await promises_1.default.writeFile(absolutePath, content, "utf8");
        this.summaryCache.delete(node_path_1.default.resolve(root));
    }
    async createFile(root, relativePath) {
        const normalized = normalizeRelativePath(relativePath.trim()).replace(/^\/+/, "");
        if (!normalized || normalized.endsWith("/")) {
            throw new Error("Invalid file path");
        }
        const absolutePath = assertPathWithinRoot(root, normalized);
        await promises_1.default.mkdir(node_path_1.default.dirname(absolutePath), { recursive: true });
        const handle = await promises_1.default.open(absolutePath, "wx");
        await handle.close();
        this.summaryCache.delete(node_path_1.default.resolve(root));
    }
    async deleteFile(root, relativePath) {
        const normalized = normalizeRelativePath(relativePath.trim()).replace(/^\/+/, "");
        if (!normalized) {
            throw new Error("Invalid file path");
        }
        const absolutePath = assertPathWithinRoot(root, normalized);
        const stat = await promises_1.default.stat(absolutePath);
        if (!stat.isFile()) {
            throw new Error("Not a regular file");
        }
        await promises_1.default.unlink(absolutePath);
        this.summaryCache.delete(node_path_1.default.resolve(root));
    }
}
exports.FileService = FileService;
