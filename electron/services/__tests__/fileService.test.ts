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

  it("reads and writes a text file under the root", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    const filePath = path.join(tempDir, "src", "note.txt");
    await fs.writeFile(filePath, "before", "utf8");

    await expect(service.readFile(tempDir, "src/note.txt")).resolves.toBe("before");

    await service.writeFile(tempDir, "src/note.txt", "after");

    await expect(fs.readFile(filePath, "utf8")).resolves.toBe("after");
    await expect(service.listFileSummaries(tempDir)).resolves.toEqual([
      expect.objectContaining({
        relativePath: "src/note.txt",
        size: 5
      })
    ]);
  });
});
