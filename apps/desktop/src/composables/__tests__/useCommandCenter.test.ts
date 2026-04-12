import { describe, expect, it, vi, beforeEach } from "vitest";
import { createCommandCenter } from "../useCommandCenter";

function makeCtx(overrides: Partial<Parameters<typeof createCommandCenter>[0]> = {}) {
  return {
    onSelectCenterTab: vi.fn(),
    onToggleSidebar: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides
  };
}

describe("createCommandCenter", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  it("starts closed with no filter", () => {
    const cc = createCommandCenter(ctx);
    expect(cc.isOpen.value).toBe(false);
    expect(cc.activeFilter.value).toBeNull();
  });

  it("toggle opens and closes", () => {
    const cc = createCommandCenter(ctx);
    cc.toggle();
    expect(cc.isOpen.value).toBe(true);
    cc.toggle();
    expect(cc.isOpen.value).toBe(false);
  });

  it("close resets activeFilter", () => {
    const cc = createCommandCenter(ctx);
    cc.isOpen.value = true;
    cc.activeFilter.value = "agents";
    cc.close();
    expect(cc.isOpen.value).toBe(false);
    expect(cc.activeFilter.value).toBeNull();
  });

  it("quickActions has 8 entries", () => {
    const cc = createCommandCenter(ctx);
    expect(cc.quickActions).toHaveLength(8);
  });

  it("quickActions include descriptions for the command center help list", () => {
    const cc = createCommandCenter(ctx);
    for (const a of cc.quickActions) {
      expect(a.description.trim().length).toBeGreaterThan(12);
    }
  });

  it("agent action calls onSelectCenterTab('agent') and closes", () => {
    const cc = createCommandCenter(ctx);
    cc.isOpen.value = true;
    const agentAction = cc.quickActions.find((a) => a.id === "agent")!;
    agentAction.action();
    expect(ctx.onSelectCenterTab).toHaveBeenCalledWith("agent");
    expect(cc.isOpen.value).toBe(false);
  });

  it("diff action calls onSelectCenterTab('diff') and closes", () => {
    const cc = createCommandCenter(ctx);
    cc.isOpen.value = true;
    const diffAction = cc.quickActions.find((a) => a.id === "diff")!;
    diffAction.action();
    expect(ctx.onSelectCenterTab).toHaveBeenCalledWith("diff");
    expect(cc.isOpen.value).toBe(false);
  });

  it("files action calls onSelectCenterTab('files') and closes", () => {
    const cc = createCommandCenter(ctx);
    cc.isOpen.value = true;
    const filesAction = cc.quickActions.find((a) => a.id === "files")!;
    filesAction.action();
    expect(ctx.onSelectCenterTab).toHaveBeenCalledWith("files");
    expect(cc.isOpen.value).toBe(false);
  });

  it("searchThreads toggles activeFilter to agents", () => {
    const cc = createCommandCenter(ctx);
    const action = cc.quickActions.find((a) => a.id === "searchThreads")!;
    action.action();
    expect(cc.activeFilter.value).toBe("agents");
    action.action(); // toggle off
    expect(cc.activeFilter.value).toBeNull();
  });

  it("searchWorktrees toggles activeFilter to worktrees", () => {
    const cc = createCommandCenter(ctx);
    const action = cc.quickActions.find((a) => a.id === "searchWorktrees")!;
    action.action();
    expect(cc.activeFilter.value).toBe("worktrees");
    action.action();
    expect(cc.activeFilter.value).toBeNull();
  });

  it("sidebar action calls onToggleSidebar and closes", () => {
    const cc = createCommandCenter(ctx);
    cc.isOpen.value = true;
    const action = cc.quickActions.find((a) => a.id === "sidebar")!;
    action.action();
    expect(ctx.onToggleSidebar).toHaveBeenCalled();
    expect(cc.isOpen.value).toBe(false);
  });

  it("settings action calls onOpenSettings and closes", () => {
    const cc = createCommandCenter(ctx);
    cc.isOpen.value = true;
    const action = cc.quickActions.find((a) => a.id === "settings")!;
    action.action();
    expect(ctx.onOpenSettings).toHaveBeenCalled();
    expect(cc.isOpen.value).toBe(false);
  });

  it("switching filter replaces previous filter (not additive)", () => {
    const cc = createCommandCenter(ctx);
    const threads = cc.quickActions.find((a) => a.id === "searchThreads")!;
    const worktrees = cc.quickActions.find((a) => a.id === "searchWorktrees")!;
    threads.action();
    expect(cc.activeFilter.value).toBe("agents");
    worktrees.action();
    expect(cc.activeFilter.value).toBe("worktrees");
  });
});
