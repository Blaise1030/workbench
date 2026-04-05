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
  default: {
    props: ["modelValue", "tabs"],
    emits: ["update:modelValue"],
    template: `
      <div>
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          @click="$emit('update:modelValue', tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    `
  }
}));
vi.mock("@/components/ui/BaseButton.vue", () => ({
  default: { template: "<button><slot /></button>" }
}));
vi.mock("@/components/TerminalPane.vue", () => ({
  default: { template: "<div />" }
}));
vi.mock("@/components/FileSearchEditor.vue", () => ({
  default: {
    props: ["worktreePath"],
    template: '<div data-testid="file-search-editor">{{ worktreePath }}</div>'
  }
}));
vi.mock("@/components/ThreadSidebar.vue", () => ({
  default: {
    props: ["threads"],
    computed: {
      titles(): string {
        return this.threads.map((t: { title: string }) => t.title).join("|");
      }
    },
    template: `
      <div>
        <div data-testid="thread-sidebar">{{ titles }}</div>
        <button
          type="button"
          data-testid="thread-sidebar-reorder"
          @click="$emit('reorder', ['thread-2', 'thread-1'])"
        >
          reorder
        </button>
      </div>
    `
  }
}));

function makeSnapshot(threadTitles: string | string[]): WorkspaceSnapshot {
  const titles = Array.isArray(threadTitles) ? threadTitles : [threadTitles];

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
    threads: titles.map((title, index) => ({
      id: `thread-${index + 1}`,
      projectId: "project-1",
      worktreeId: "worktree-1",
      title,
      agent: "codex",
      sortOrder: index,
      createdAt: "2026-04-06T00:00:00.000Z",
      updatedAt: "2026-04-06T00:00:00.000Z"
    })),
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
      listFiles: vi.fn(),
      searchFiles: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createFile: vi.fn(),
      deleteFile: vi.fn(),
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
      }),
      onWorkingTreeFilesChanged: vi.fn(() => () => {})
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

  it("renders the file search editor when the Files tab is selected", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(makeSnapshot("Codex CLI"));
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);

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
      listFiles: vi.fn(),
      searchFiles: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createFile: vi.fn(),
      deleteFile: vi.fn(),
      applyPatch: vi.fn(),
      ptyCreate: vi.fn().mockResolvedValue({ buffer: "" }),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      pickRepoDirectory: vi.fn(),
      onWorkspaceChanged: vi.fn(() => () => {}),
      onWorkingTreeFilesChanged: vi.fn(() => () => {})
    };

    const wrapper = mount(WorkspaceLayout, {
      global: {
        plugins: [createPinia()]
      }
    });

    await flushPromises();
    const filesButton = wrapper.findAll("button").find((button) => button.text().includes("Files"));

    expect(filesButton).toBeTruthy();
    await filesButton!.trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="file-search-editor"]').text()).toBe("/tmp/instrument");
    expect(wrapper.get('[data-testid="workspace-files-pane"]').classes()).toContain("border-t");
  });

  it("persists reordered active-worktree threads and then accepts the refreshed snapshot order", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const initialSnapshot = makeSnapshot(["First", "Second"]);
    const refreshedSnapshot = makeSnapshot(["Server Second", "Server First"]);
    const getSnapshot = vi
      .fn<WorkspaceApi["getSnapshot"]>()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(refreshedSnapshot);
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);
    let resolveReorder: (() => void) | undefined;
    const reorderThreads = vi.fn<WorkspaceApi["reorderThreads"]>(
      () =>
        new Promise<void>((resolve) => {
          resolveReorder = resolve;
        })
    );

    window.workspaceApi = {
      getSnapshot,
      reorderThreads,
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
      listFiles: vi.fn(),
      searchFiles: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      createFile: vi.fn(),
      deleteFile: vi.fn(),
      applyPatch: vi.fn(),
      ptyCreate: vi.fn().mockResolvedValue({ buffer: "" }),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      pickRepoDirectory: vi.fn(),
      onWorkspaceChanged: vi.fn(() => () => {}),
      onWorkingTreeFilesChanged: vi.fn(() => () => {})
    };

    const wrapper = mount(WorkspaceLayout, {
      global: {
        plugins: [createPinia()]
      }
    });

    await flushPromises();
    expect(wrapper.get('[data-testid="thread-sidebar"]').text()).toBe("First|Second");

    await wrapper.get('[data-testid="thread-sidebar-reorder"]').trigger("click");
    await flushPromises();

    expect(reorderThreads).toHaveBeenCalledWith({
      worktreeId: "worktree-1",
      orderedThreadIds: ["thread-2", "thread-1"]
    });
    expect(wrapper.get('[data-testid="thread-sidebar"]').text()).toBe("Second|First");

    resolveReorder?.();
    await flushPromises();

    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="thread-sidebar"]').text()).toBe("Server Second|Server First");
  });
});
