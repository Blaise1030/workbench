import { describe, it, expect } from "vitest";
import path from "node:path";
import { assertPathWithinRoot } from "../utils/pathGuard.js";
import { EditService } from "../services/editService.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";

describe("assertPathWithinRoot", () => {
  it("returns resolved path for a normal relative path", () => {
    const result = assertPathWithinRoot("/project", "src/index.ts");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });

  it("returns resolved path for a nested relative path", () => {
    const result = assertPathWithinRoot("/project", "a/b/c.ts");
    expect(result).toBe("/project/a/b/c.ts");
  });

  it("throws for a path that escapes root via ..", () => {
    expect(() => assertPathWithinRoot("/project", "../../etc/passwd")).toThrow(
      "Path escapes root"
    );
  });

  it("throws for an absolute path that is outside root", () => {
    expect(() => assertPathWithinRoot("/project", "/etc/passwd")).toThrow(
      "Path escapes root"
    );
  });

  it("allows a path that is the root itself", () => {
    const result = assertPathWithinRoot("/project", ".");
    expect(result).toBe("/project");
  });

  it("throws for a path using .. that looks relative but escapes", () => {
    expect(() => assertPathWithinRoot("/project", "src/../../etc/hosts")).toThrow(
      "Path escapes root"
    );
  });
});

describe("EditService.applyPatch path guard", () => {
  it("rejects a relativeFilePath that escapes cwd", async () => {
    const service = new EditService();
    await expect(
      service.applyPatch({
        cwd: "/tmp/project",
        relativeFilePath: "../../etc/passwd",
        content: "evil"
      })
    ).rejects.toThrow("Path escapes root");
  });

  it("writes a file at a legitimate relative path", async () => {
    const dir = await fs.mkdtemp(os.tmpdir() + "/edit-test-");
    const service = new EditService();
    await service.applyPatch({ cwd: dir, relativeFilePath: "out.txt", content: "hello" });
    const result = await fs.readFile(dir + "/out.txt", "utf8");
    expect(result).toBe("hello");
    await fs.rm(dir, { recursive: true });
  });
});
