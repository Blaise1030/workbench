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
      "Path escapes the active worktree"
    );
  });

  it("rejects writes that escape the root", async () => {
    await expect(service.writeFile(tempDir, "../outside.txt", "nope")).rejects.toThrow(
      "Path escapes the active worktree"
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
      "Path escapes the active worktree"
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
});
