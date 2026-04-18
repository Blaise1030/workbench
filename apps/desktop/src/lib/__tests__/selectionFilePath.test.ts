import { describe, expect, it, vi } from "vitest";
import {
  extractSelectionFilePathCandidates,
  resolveSelectionFilePath
} from "@/lib/selectionFilePath";

describe("selectionFilePath", () => {
  it("extracts a relative file path with line suffix from selected text", () => {
    expect(
      extractSelectionFilePathCandidates("apps/desktop/src/App.vue:12:4", "/repo")
    ).toEqual(["apps/desktop/src/App.vue"]);
  });

  it("extracts a worktree-relative path from an absolute selected path", () => {
    expect(
      extractSelectionFilePathCandidates("/repo/apps/desktop/src/App.vue", "/repo")
    ).toEqual(["apps/desktop/src/App.vue"]);
  });

  it("ignores paths outside the current worktree", () => {
    expect(
      extractSelectionFilePathCandidates("/other/project/src/App.vue", "/repo")
    ).toEqual([]);
  });

  it("resolves the first matching file path from the workspace file list", async () => {
    const api = {
      listFiles: vi.fn().mockResolvedValue([
        { kind: "file", relativePath: "apps/desktop/src/App.vue" },
        { kind: "file", relativePath: "README.md" }
      ])
    } as unknown as Pick<WorkspaceApi, "listFiles">;

    await expect(
      resolveSelectionFilePath(api, "/repo", "See apps/desktop/src/App.vue:12 for details")
    ).resolves.toBe("apps/desktop/src/App.vue");
  });
});
