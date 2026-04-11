import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileService } from "../fileService";

describe("FileService", () => {
  let tempDir: string;
  let service: FileService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "instrument-file-service-"));
    service = new FileService();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("lists file summaries within the root", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "App.vue"), "<template />", "utf8");
    await fs.writeFile(path.join(tempDir, "src", "FileSearchEditor.vue"), "<template />", "utf8");

    await expect(service.listFileSummaries(tempDir)).resolves.toEqual([
      expect.objectContaining({
        relativePath: "src",
        kind: "directory"
      }),
      expect.objectContaining({
        relativePath: "src/App.vue",
        size: 12
      }),
      expect.objectContaining({
        relativePath: "src/FileSearchEditor.vue",
        size: 12
      })
    ]);
  });

  it("ignores noisy directories while building summaries", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git", "objects"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "dist"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "dist-electron"), { recursive: true });

    await fs.writeFile(path.join(tempDir, "src", "keep-me.ts"), "", "utf8");
    await fs.writeFile(path.join(tempDir, "node_modules", "pkg", "ignore-me.ts"), "", "utf8");
    await fs.writeFile(path.join(tempDir, ".git", "objects", "ignore-me.ts"), "", "utf8");
    await fs.writeFile(path.join(tempDir, "dist", "ignore-me.ts"), "", "utf8");
    await fs.writeFile(path.join(tempDir, "dist-electron", "ignore-me.ts"), "", "utf8");

    await expect(service.listFileSummaries(tempDir)).resolves.toEqual([
      expect.objectContaining({ relativePath: "src", kind: "directory" }),
      expect.objectContaining({ relativePath: "src/keep-me.ts" })
    ]);
  });

  it("rejects reads that escape the root", async () => {
    await expect(service.readFile(tempDir, "../outside.txt")).rejects.toThrow(
      "Path escapes root"
    );
  });

  it("rejects writes that escape the root", async () => {
    await expect(service.writeFile(tempDir, "../outside.txt", "nope")).rejects.toThrow(
      "Path escapes root"
    );
  });

  it("creates an empty file and parent directories", async () => {
    await service.createFile(tempDir, "src/new/empty.ts");

    await expect(fs.readFile(path.join(tempDir, "src", "new", "empty.ts"), "utf8")).resolves.toBe(
      ""
    );
    await expect(service.listFileSummaries(tempDir)).resolves.toEqual([
      expect.objectContaining({ relativePath: "src", kind: "directory" }),
      expect.objectContaining({ relativePath: "src/new", kind: "directory" }),
      expect.objectContaining({ relativePath: "src/new/empty.ts", size: 0 })
    ]);
  });

  it("rejects create when the file already exists", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "taken.ts"), "x", "utf8");

    await expect(service.createFile(tempDir, "src/taken.ts")).rejects.toThrow();
  });

  it("deletes a regular file under the root", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "gone.ts"), "bye", "utf8");

    await service.deleteFile(tempDir, "src/gone.ts");

    await expect(fs.access(path.join(tempDir, "src", "gone.ts"))).rejects.toThrow();
    await expect(service.listFileSummaries(tempDir)).resolves.toEqual([
      expect.objectContaining({ relativePath: "src", kind: "directory" })
    ]);
  });

  it("rejects deletes that escape the root", async () => {
    await expect(service.deleteFile(tempDir, "../nope.txt")).rejects.toThrow(
      "Path escapes root"
    );
  });

  it("creates a folder and parent directories", async () => {
    await service.createFolder(tempDir, "docs/guides");

    const st = await fs.stat(path.join(tempDir, "docs", "guides"));
    expect(st.isDirectory()).toBe(true);
  });

  it("rejects createFolder when the folder already exists", async () => {
    await fs.mkdir(path.join(tempDir, "existing"), { recursive: true });

    await expect(service.createFolder(tempDir, "existing")).rejects.toThrow("Folder already exists");
  });

  it("deletes a folder recursively", async () => {
    await fs.mkdir(path.join(tempDir, "drop", "nested"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "drop", "nested", "x.txt"), "x", "utf8");

    await service.deleteFolder(tempDir, "drop");

    await expect(fs.access(path.join(tempDir, "drop"))).rejects.toThrow();
  });

  it("rejects deleteFolder for a file path", async () => {
    await fs.writeFile(path.join(tempDir, "only.txt"), "x", "utf8");

    await expect(service.deleteFolder(tempDir, "only.txt")).rejects.toThrow("Not a folder");
  });

  it("finds files whose UTF-8 contents contain the query (case-insensitive)", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "a.ts"), "hello world", "utf8");
    await fs.writeFile(path.join(tempDir, "src", "b.ts"), "nothing", "utf8");

    await expect(service.searchFileContents(tempDir, "hello")).resolves.toEqual(["src/a.ts"]);
    await expect(service.searchFileContents(tempDir, "HELLO")).resolves.toEqual(["src/a.ts"]);
    await expect(service.searchFileContents(tempDir, "nothing")).resolves.toEqual(["src/b.ts"]);
    await expect(service.searchFileContents(tempDir, "xyz")).resolves.toEqual([]);
  });

  it("returns empty for blank content queries", async () => {
    await fs.writeFile(path.join(tempDir, "x.txt"), "a", "utf8");
    await expect(service.searchFileContents(tempDir, "   ")).resolves.toEqual([]);
  });

  it("skips binary files when searching contents", async () => {
    await fs.writeFile(path.join(tempDir, "bin.dat"), Buffer.from([0x48, 0x00, 0x49]));
    await expect(service.searchFileContents(tempDir, "HI")).resolves.toEqual([]);
  });

  it("reads and writes a text file under the root", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    const filePath = path.join(tempDir, "src", "note.txt");
    await fs.writeFile(filePath, "before", "utf8");

    await expect(service.readFile(tempDir, "src/note.txt")).resolves.toBe("before");

    await service.writeFile(tempDir, "src/note.txt", "after");

    await expect(fs.readFile(filePath, "utf8")).resolves.toBe("after");
    await expect(service.listFileSummaries(tempDir)).resolves.toEqual([
      expect.objectContaining({ relativePath: "src", kind: "directory" }),
      expect.objectContaining({
        relativePath: "src/note.txt",
        size: 5
      })
    ]);
  });

  it("resolves relative markdown image hrefs to data URLs under the worktree", async () => {
    await fs.mkdir(path.join(tempDir, "docs", "assets"), { recursive: true });
    const pngPath = path.join(tempDir, "docs", "assets", "pic.png");
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    await fs.writeFile(pngPath, tinyPng);

    const url = await service.resolveMarkdownImageUrl(tempDir, "docs/page.md", "assets/pic.png");
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(Buffer.from(url!.split(",")[1]!, "base64").equals(tinyPng)).toBe(true);
  });

  it("returns null when a .png is a Git LFS pointer", async () => {
    await fs.mkdir(path.join(tempDir, "docs"), { recursive: true });
    const pngPath = path.join(tempDir, "docs", "lfs-fake.png");
    await fs.writeFile(
      pngPath,
      "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n",
      "utf8"
    );

    await expect(service.resolveMarkdownImageUrl(tempDir, "docs/page.md", "lfs-fake.png")).resolves.toBeNull();
  });

  it("passes through http(s) and data markdown image hrefs", async () => {
    await expect(service.resolveMarkdownImageUrl(tempDir, "a.md", "https://example.com/x.png")).resolves.toBe(
      "https://example.com/x.png"
    );
    await expect(service.resolveMarkdownImageUrl(tempDir, "a.md", "data:image/png;base64,xx")).resolves.toBe(
      "data:image/png;base64,xx"
    );
  });

  it("returns null for markdown image hrefs that escape the worktree", async () => {
    await expect(service.resolveMarkdownImageUrl(tempDir, "docs/a.md", "../../../outside.txt")).resolves.toBeNull();
  });

  it("reads a valid PNG from an absolute path under the temp directory", async () => {
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const abs = path.join(os.tmpdir(), `instrument-absimg-${Date.now()}.png`);
    await fs.writeFile(abs, tinyPng);
    try {
      const url = await service.readImageDataUrlFromAbsolutePath(abs);
      expect(url).toMatch(/^data:image\/png;base64,/);
    } finally {
      await fs.rm(abs, { force: true });
    }
  });

  it("rejects absolute image paths outside temp and user media folders", async () => {
    const dir = path.join(os.homedir(), ".instrument-test-external-reject");
    await fs.mkdir(dir, { recursive: true });
    const abs = path.join(dir, "x.png");
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    await fs.writeFile(abs, tinyPng);
    try {
      await expect(service.readImageDataUrlFromAbsolutePath(abs)).resolves.toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
