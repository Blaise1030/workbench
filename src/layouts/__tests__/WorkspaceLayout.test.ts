import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "@shared/ipc";

vi.mock("@/components/ProjectTabs.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/ThemeToggle.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/AgentCommandsSettingsDialog.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/DiffReviewPanel.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/ui/PillTabs.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/ui/BaseButton.vue", () => ({
  default: { template: "<button><slot /></button>" }
}));
vi.mock("@/components/TerminalPane.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/ThreadSidebar.vue", () => ({
  default: {
    props: ["threads"],
    computed: {
      titles(): string {
        return this.threads.map((t: { title: string }) => t.title).join("|");
      }
    },
    template: '<div data-testid="thread-sidebar">{{ titles }}</div>'
  }
}));

function makeSnapshot(title: string): WorkspaceSnapshot {
  return {
    projects: [
      {
        id: "project-1",
        name: "instrument",
        repoPath: "/tmp/instrument",
        status: "idle",
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      }
    ],
    worktrees: [
      {
        id: "worktree-1",
        projectId: "project-1",
        name: "main",
        branch: "main",
        path: "/tmp/instrument",
        isActive: true,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      }
    ],
    threads: [
      {
        id: "thread-1",
        projectId: "project-1",
        worktreeId: "worktree-1",
        title,
        agent: "codex",
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      }
    ],
    activeProjectId: "project-1",
    activeWorktreeId: "worktree-1",
    activeThreadId: "thread-1"
  };
}

describe("WorkspaceLayout", () => {
  afterEach(() => {
    delete window.workspaceApi;
  });

  it("refreshes the sidebar when Electron reports a background workspace change", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi
      .fn<WorkspaceApi["getSnapshot"]>()
      .mockResolvedValueOnce(makeSnapshot("Codex CLI"))
      .mockResolvedValueOnce(makeSnapshot("Rename thread from first prompt"));
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);
    let onWorkspaceChanged: (() => void) | undefined;

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive: vi.fn(),
      createThread: vi.fn(),
      setActiveThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      startRun: vi.fn(),
      sendRunInput: vi.fn(),
      interruptRun: vi.fn(),
      fileDiff: vi.fn(),
      stageAll: vi.fn(),
      discardAll: vi.fn(),
      applyPatch: vi.fn(),
      ptyCreate: vi.fn().mockResolvedValue({ buffer: "" }),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      pickRepoDirectory: vi.fn(),
      onWorkspaceChanged: vi.fn((callback: () => void) => {
        onWorkspaceChanged = callback;
        return () => {};
      })
    };

    const wrapper = mount(WorkspaceLayout, {
      global: {
        plugins: [createPinia()]
      }
    });

    await flushPromises();
    expect(wrapper.get('[data-testid="thread-sidebar"]').text()).toContain("Codex CLI");

    expect(onWorkspaceChanged).toBeTypeOf("function");
    onWorkspaceChanged?.();
    await flushPromises();

    expect(wrapper.get('[data-testid="thread-sidebar"]').text()).toContain(
      "Rename thread from first prompt"
    );
  });
});
