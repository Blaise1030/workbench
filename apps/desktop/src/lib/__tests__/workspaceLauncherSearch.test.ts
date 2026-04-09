import { describe, expect, it } from "vitest";
import type { Project, Thread, Worktree } from "@shared/domain";
import {
  parseLauncherQuery,
  searchLauncherCommands,
  searchLauncherRows,
  searchLauncherWorkspaceSwitch
} from "../workspaceLauncherSearch";

const baseThread = (partial: Partial<Thread> & Pick<Thread, "id" | "title" | "agent">): Thread => ({
  projectId: "p1",
  worktreeId: "wt1",
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

describe("searchLauncherCommands", () => {
  it("lists toggle sidebar when search is empty", () => {
    const rows = searchLauncherCommands("", { "toggle-thread-sidebar": "⌘B" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      section: "commands",
      kind: "command",
      id: "toggle-thread-sidebar",
      shortcutHint: "⌘B"
    });
  });

  it("matches sidebar keyword", () => {
    const rows = searchLauncherCommands("collapse rail", {});
    expect(rows.some((r) => r.kind === "command" && r.id === "toggle-thread-sidebar")).toBe(true);
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
      section: "linkedWorktrees",
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

const sampleProject = (partial: Partial<Project> & Pick<Project, "id" | "name" | "repoPath">): Project => ({
  status: "idle",
  tabOrder: 0,
  createdAt: "",
  updatedAt: "",
  ...partial
});

const sampleWorktree = (
  partial: Partial<Worktree> & Pick<Worktree, "id" | "projectId" | "name" | "branch" | "path">
): Worktree => ({
  isActive: true,
  createdAt: "",
  updatedAt: "",
  ...partial
});

describe("searchLauncherWorkspaceSwitch", () => {
  const projects: Project[] = [
    sampleProject({ id: "p1", name: "Alpha", repoPath: "/repos/alpha" }),
    sampleProject({ id: "p2", name: "Beta", repoPath: "/repos/beta" })
  ];

  const worktrees: Worktree[] = [
    sampleWorktree({ id: "wt1", projectId: "p1", name: "main checkout", branch: "main", path: "/repos/alpha/main" }),
    sampleWorktree({ id: "wt2", projectId: "p1", name: "feature checkout", branch: "feature/x", path: "/repos/alpha/f" })
  ];

  it("lists other workspaces and other worktrees when query is empty", () => {
    const rows = searchLauncherWorkspaceSwitch(
      { mode: "default", query: "" },
      "",
      projects,
      "p1",
      worktrees,
      "wt1"
    );
    expect(rows.filter((r) => r.kind === "project")).toHaveLength(1);
    expect(rows.find((r) => r.kind === "project")).toMatchObject({
      section: "workspace",
      projectId: "p2",
      name: "Beta"
    });
    expect(rows.filter((r) => r.kind === "worktree")).toHaveLength(1);
    expect(rows.find((r) => r.kind === "worktree")).toMatchObject({
      section: "worktrees",
      worktreeId: "wt2",
      branch: "feature/x"
    });
  });

  it("returns nothing in worktree file mode", () => {
    expect(
      searchLauncherWorkspaceSwitch({ mode: "worktree", query: "x" }, "x", projects, "p1", worktrees, "wt1")
    ).toEqual([]);
  });

  it("matches project and worktree by search text", () => {
    const rows = searchLauncherWorkspaceSwitch(
      { mode: "default", query: "beta" },
      "beta",
      projects,
      "p1",
      worktrees,
      "wt1"
    );
    expect(rows.some((r) => r.kind === "project" && r.projectId === "p2")).toBe(true);
    const feat = searchLauncherWorkspaceSwitch(
      { mode: "default", query: "feature" },
      "feature",
      projects,
      "p1",
      worktrees,
      "wt1"
    );
    expect(feat.some((r) => r.kind === "worktree" && r.worktreeId === "wt2")).toBe(true);
  });
});
