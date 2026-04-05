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
class FileService {
    async searchFiles(root, query) {
        const trimmedQuery = query.trim().toLowerCase();
        if (!trimmedQuery)
            return [];
        const resolvedRoot = node_path_1.default.resolve(root);
        const allFiles = [];
        await collectFiles(resolvedRoot, resolvedRoot, allFiles);
        return allFiles
            .filter((relativePath) => relativePath.toLowerCase().includes(trimmedQuery))
            .sort((a, b) => a.localeCompare(b));
    }
    async readFile(root, relativePath) {
        const absolutePath = assertPathWithinRoot(root, relativePath);
        return promises_1.default.readFile(absolutePath, "utf8");
    }
    async writeFile(root, relativePath, content) {
        const absolutePath = assertPathWithinRoot(root, relativePath);
        await promises_1.default.writeFile(absolutePath, content, "utf8");
    }
}
exports.FileService = FileService;
