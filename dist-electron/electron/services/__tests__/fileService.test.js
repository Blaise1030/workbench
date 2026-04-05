"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const vitest_1 = require("vitest");
const fileService_1 = require("../fileService");
(0, vitest_1.describe)("FileService", () => {
    let tempDir;
    let service;
    (0, vitest_1.beforeEach)(async () => {
        tempDir = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "instrument-file-service-"));
        service = new fileService_1.FileService();
    });
    (0, vitest_1.afterEach)(async () => {
        await promises_1.default.rm(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)("lists file summaries within the root", async () => {
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, "src"), { recursive: true });
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, "src", "App.vue"), "<template />", "utf8");
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, "src", "FileSearchEditor.vue"), "<template />", "utf8");
        await (0, vitest_1.expect)(service.listFileSummaries(tempDir)).resolves.toEqual([
            vitest_1.expect.objectContaining({
                relativePath: "src/App.vue",
                size: 11
            }),
            vitest_1.expect.objectContaining({
                relativePath: "src/FileSearchEditor.vue",
                size: 11
            })
        ]);
    });
    (0, vitest_1.it)("ignores noisy directories while building summaries", async () => {
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, "src"), { recursive: true });
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, "node_modules", "pkg"), { recursive: true });
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, ".git", "objects"), { recursive: true });
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, "dist"), { recursive: true });
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, "dist-electron"), { recursive: true });
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, "src", "keep-me.ts"), "", "utf8");
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, "node_modules", "pkg", "ignore-me.ts"), "", "utf8");
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, ".git", "objects", "ignore-me.ts"), "", "utf8");
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, "dist", "ignore-me.ts"), "", "utf8");
        await promises_1.default.writeFile(node_path_1.default.join(tempDir, "dist-electron", "ignore-me.ts"), "", "utf8");
        await (0, vitest_1.expect)(service.listFileSummaries(tempDir)).resolves.toEqual([
            vitest_1.expect.objectContaining({ relativePath: "src/keep-me.ts" })
        ]);
    });
    (0, vitest_1.it)("rejects reads that escape the root", async () => {
        await (0, vitest_1.expect)(service.readFile(tempDir, "../outside.txt")).rejects.toThrow("Path escapes the active worktree");
    });
    (0, vitest_1.it)("rejects writes that escape the root", async () => {
        await (0, vitest_1.expect)(service.writeFile(tempDir, "../outside.txt", "nope")).rejects.toThrow("Path escapes the active worktree");
    });
    (0, vitest_1.it)("reads and writes a text file under the root", async () => {
        await promises_1.default.mkdir(node_path_1.default.join(tempDir, "src"), { recursive: true });
        const filePath = node_path_1.default.join(tempDir, "src", "note.txt");
        await promises_1.default.writeFile(filePath, "before", "utf8");
        await (0, vitest_1.expect)(service.readFile(tempDir, "src/note.txt")).resolves.toBe("before");
        await service.writeFile(tempDir, "src/note.txt", "after");
        await (0, vitest_1.expect)(promises_1.default.readFile(filePath, "utf8")).resolves.toBe("after");
        await (0, vitest_1.expect)(service.listFileSummaries(tempDir)).resolves.toEqual([
            vitest_1.expect.objectContaining({
                relativePath: "src/note.txt",
                size: 5
            })
        ]);
    });
});
