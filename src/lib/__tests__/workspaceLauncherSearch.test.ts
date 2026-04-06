import { describe, expect, it } from "vitest";
import type { Thread } from "@shared/domain";
import { parseLauncherQuery, searchLauncherRows } from "../workspaceLauncherSearch";

const baseThread = (partial: Partial<Thread> & Pick<Thread, "id" | "title" | "agent">): Thread => ({
  projectId: "p1",
  worktreeId: "wt1",
  sortOrder: 0,
  createdAt: "",
  updatedAt: "",
  ...partial
});

describe("parseLauncherQuery", () => {
  it("default mode for normal query", () => {
    expect(parseLauncherQuery("hello")).toEqual({ mode: "default", query: "hello" });
  });

  it("worktree mode strips @wt and following space", () => {
    expect(parseLauncherQuery("@wt foo")).toEqual({ mode: "worktree", query: "foo" });
  });

  it("worktree mode with @wt only", () => {
    expect(parseLauncherQuery("@wt")).toEqual({ mode: "worktree", query: "" });
  });

  it("worktree mode with @wt and space only", () => {
    expect(parseLauncherQuery("@wt ")).toEqual({ mode: "worktree", query: "" });
  });

  it("remainder without leading space after @wt", () => {
    expect(parseLauncherQuery("@wtfoo")).toEqual({ mode: "worktree", query: "foo" });
  });

  it("@WT is not a token (case-sensitive)", () => {
    expect(parseLauncherQuery("@WT x")).toEqual({ mode: "default", query: "@WT x" });
  });
});

describe("searchLauncherRows", () => {
  it("returns thread and branch file hits in default mode", () => {
    const threads = [
      baseThread({ id: "t1", title: "parser bugfix", agent: "claude" })
    ];
    const rows = searchLauncherRows(
      { mode: "default", query: "parser" },
      threads,
      [{ relativePath: "src/parser.ts" }],
      []
    );
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toContain("thread");
    expect(kinds).toContain("file");
    expect(rows.find((r) => r.kind === "thread")).toMatchObject({ section: "agents" });
    expect(rows.find((r) => r.kind === "file")).toMatchObject({ section: "files" });
  });

  it("worktree mode returns only other worktree files", () => {
    const threads = [baseThread({ id: "t1", title: "parser", agent: "claude" })];
    const rows = searchLauncherRows(
      { mode: "worktree", query: "config" },
      threads,
      [{ relativePath: "config/root.json" }],
      [
        {
          worktreeId: "wt2",
          worktreeName: "feature",
          files: [{ relativePath: "config/app.json" }]
        }
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      section: "workspace",
      kind: "file",
      relativePath: "config/app.json",
      worktreeId: "wt2",
      worktreeLabel: "feature"
    });
  });

  it("worktree mode empty query returns no rows", () => {
    const rows = searchLauncherRows(
      { mode: "worktree", query: "" },
      [],
      [],
      [{ worktreeId: "w", worktreeName: "x", files: [{ relativePath: "a.ts" }] }]
    );
    expect(rows).toEqual([]);
  });
});
