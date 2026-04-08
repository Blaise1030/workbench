import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "@shared/ipc";

const mockFileSearchConfirmContextSwitch = vi.fn(() => Promise.resolve(true));

vi.mock("@/components/ProjectTabs.vue", () => ({
  default: {
    props: ["projects"],
    emits: ["select", "create", "configureCommands", "remove"],
    template: `
      <div>
        <button
          v-for="project in projects"
          :key="project.id"
          type="button"
          :data-project-id="project.id"
          @click="$emit('select', project.id)"
        >
          {{ project.name }}
        </button>
        <button
          v-for="project in projects"
          :key="'remove-' + project.id"
          type="button"
          :data-remove-project-id="project.id"
          @click="$emit('remove', project.id)"
        >
          remove {{ project.name }}
        </button>
      </div>
    `
  }
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
          <span v-if="tab.tag">[{{ tab.tag }}] </span>{{ tab.label }}
        </button>
      </div>
    `
  }
}));
vi.mock("@/components/ui/Button.vue", () => ({
  default: { template: "<button><slot /></button>" }
}));
vi.mock("@/components/TerminalPane.vue", () => ({
  default: { template: '<div data-testid="terminal-pane" />' }
}));
vi.mock("@/components/FileSearchEditor.vue", () => ({
  default: {
    props: ["worktreePath", "contextLabel"],
    methods: {
      focusSearch() {},
      refreshFileExplorer() {},
      confirmContextSwitch(nextWorktreePath: string | null) {
        return mockFileSearchConfirmContextSwitch(nextWorktreePath);
      },
      openWorkspaceFile() {
        return Promise.resolve();
      }
    },
    template: '<div data-testid="file-search-editor">{{ worktreePath }}<template v-if="contextLabel">|{{ contextLabel }}</template></div>'
  }
}));
vi.mock("@/components/ThreadCreateButton.vue", () => ({
  default: {
    emits: ["createWithAgent"],
    template: `
      <button
        type="button"
        data-testid="thread-create-button"
        @click="$emit('createWithAgent', { agent: 'codex', prompt: '' })"
      >
        <slot />
      </button>
    `
  }
}));
vi.mock("@/components/ThreadSidebar.vue", () => ({
  default: {
    props: ["threads"],
    emits: ["select", "reorder"],
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
          @click="$emit('reorder', { worktreeId: 'worktree-1', orderedThreadIds: ['thread-2', 'thread-1'] })"
        >
          reorder
        </button>
        <button
          v-for="thread in threads"
          :key="'select-' + thread.id"
          type="button"
          :data-thread-id="thread.id"
          @click="$emit('select', thread.id)"
        >
          select {{ thread.title }}
        </button>
      </div>
    `
  }
}));
vi.mock("@/components/WorkspaceLauncherModal.vue", () => ({
  default: {
    emits: ["pickWorktree", "update:modelValue"],
    template: `
      <div>
        <button
          type="button"
          data-testid="launcher-pick-worktree-1"
          @click="$emit('pickWorktree', 'worktree-1')"
        >
          pick worktree 1
        </button>
        <button
          type="button"
          data-testid="launcher-pick-worktree-2"
          @click="$emit('pickWorktree', 'worktree-2')"
        >
          pick worktree 2
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
        isDefault: true,
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
    activeThreadId: titles.length > 0 ? "thread-1" : null
  };
}

function makeMultiWorktreeSnapshot(): WorkspaceSnapshot {
  return {
    projects: [
      {
        id: "project-1",
        name: "instrument",
        repoPath: "/tmp/instrument",
        status: "idle",
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z",
        lastActiveWorktreeId: "worktree-1"
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
        isDefault: true,
        lastActiveThreadId: "thread-1",
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      },
      {
        id: "worktree-2",
        projectId: "project-1",
        name: "feature-a",
        branch: "feature-a",
        path: "/tmp/instrument-feature-a",
        isActive: false,
        isDefault: false,
        lastActiveThreadId: "thread-2",
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      }
    ],
    threads: [
      {
        id: "thread-1",
        projectId: "project-1",
        worktreeId: "worktree-1",
        title: "Primary thread",
        agent: "codex",
        sortOrder: 0,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      },
      {
        id: "thread-2",
        projectId: "project-1",
        worktreeId: "worktree-2",
        title: "Feature thread",
        agent: "codex",
        sortOrder: 1,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      },
      {
        id: "thread-3",
        projectId: "project-1",
        worktreeId: "worktree-2",
        title: "Second feature thread",
        agent: "codex",
        sortOrder: 2,
        createdAt: "2026-04-06T00:00:00.000Z",
        updatedAt: "2026-04-06T00:00:00.000Z"
      }
    ],
    activeProjectId: "project-1",
    activeWorktreeId: "worktree-2",
    activeThreadId: "thread-2"
  };
}

describe("WorkspaceLayout", () => {
  beforeEach(() => {
    mockFileSearchConfirmContextSwitch.mockReset();
    mockFileSearchConfirmContextSwitch.mockResolvedValue(true);
  });

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
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    const fileSearchEditorText = wrapper.get('[data-testid="file-search-editor"]').text();
    expect(fileSearchEditorText).toContain("/tmp/instrument");
    expect(fileSearchEditorText).toContain("Primary");
    expect(wrapper.get('[data-testid="workspace-files-pane"]').classes()).toContain("border-t");
  });

  it("renders the active context label in the Git Diff header", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(makeMultiWorktreeSnapshot());
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    const diffButton = wrapper.findAll("button").find((button) => button.text().includes("Git Diff"));
    expect(diffButton).toBeTruthy();

    await diffButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("feature-a");
  });

  it("shows the active worktree context in the center bar badge for the default worktree", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(makeSnapshot("Codex CLI"));
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    const agentTab = wrapper.findAll("button").find((button) => button.text().includes("Agent"));
    expect(agentTab?.text()).toContain("🤖 Agent");
    expect(wrapper.text()).toMatch(/Primary/);
  });

  it("shows the linked worktree context in the center bar badge when active", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(makeMultiWorktreeSnapshot());
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    const agentTab = wrapper.findAll("button").find((button) => button.text().includes("Agent"));
    expect(agentTab?.text()).toContain("🤖 Agent");
    expect(wrapper.text()).toContain("feature-a");
  });

  it("shows the create-thread empty state instead of the terminal when the active worktree has no threads", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(makeSnapshot([]));
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    expect(wrapper.get('[data-testid="workspace-create-thread-empty-state"]').text()).toContain("Add thread");
    expect(wrapper.find('[data-testid="terminal-pane"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Create your first thread");
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
      isGitRepository: vi.fn().mockResolvedValue(true),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

  it("switches projects by asking the backend to restore the remembered worktree and thread", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const snapshot = makeSnapshot("Codex CLI");
    snapshot.worktrees[0] = {
      ...snapshot.worktrees[0]!,
      lastActiveThreadId: "thread-1"
    };
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(snapshot);
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);
    const setActive = vi.fn<WorkspaceApi["setActive"]>().mockResolvedValue(undefined);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository: vi.fn().mockResolvedValue(true),
      setActive,
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      createThread: vi.fn(),
      setActiveThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    await wrapper.find('[data-project-id="project-1"]').trigger("click");
    await flushPromises();

    expect(setActive).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreeId: "worktree-1",
      threadId: "thread-1"
    });
  });

  it("falls back to the first known project worktree when no remembered worktree exists", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const snapshot = makeSnapshot("Codex CLI");
    snapshot.projects[0] = {
      ...snapshot.projects[0]!,
      lastActiveWorktreeId: null
    };
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(snapshot);
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);
    const setActive = vi.fn<WorkspaceApi["setActive"]>().mockResolvedValue(undefined);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository: vi.fn().mockResolvedValue(true),
      setActive,
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      createThread: vi.fn(),
      setActiveThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    await wrapper.find('[data-project-id="project-1"]').trigger("click");
    await flushPromises();

    expect(setActive).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreeId: "worktree-1",
      threadId: null
    });
  });

  it("switches to the selected thread's worktree before activating a thread in another worktree", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const initialSnapshot = makeMultiWorktreeSnapshot();
    const afterSelectSnapshot: WorkspaceSnapshot = {
      ...initialSnapshot,
      activeWorktreeId: "worktree-1",
      activeThreadId: "thread-1"
    };
    const getSnapshot = vi
      .fn<WorkspaceApi["getSnapshot"]>()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(afterSelectSnapshot);
    const setActive = vi.fn<WorkspaceApi["setActive"]>().mockResolvedValue(undefined);
    const setActiveThread = vi.fn<WorkspaceApi["setActiveThread"]>();

    window.workspaceApi = {
      getSnapshot,
      changedFiles: vi.fn().mockResolvedValue([]),
      isGitRepository: vi.fn().mockResolvedValue(true),
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive,
      createThread: vi.fn(),
      setActiveThread,
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    await wrapper.get('[data-thread-id="thread-1"]').trigger("click");
    await flushPromises();

    expect(setActive).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreeId: "worktree-1",
      threadId: "thread-1"
    });
    expect(setActiveThread).not.toHaveBeenCalled();
  });

  it("restores the default worktree context when selecting a thread in the default worktree", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const initialSnapshot = makeMultiWorktreeSnapshot();
    const afterSelectSnapshot: WorkspaceSnapshot = {
      ...initialSnapshot,
      activeWorktreeId: "worktree-1",
      activeThreadId: "thread-1"
    };
    const getSnapshot = vi
      .fn<WorkspaceApi["getSnapshot"]>()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(afterSelectSnapshot);
    const setActive = vi.fn<WorkspaceApi["setActive"]>().mockResolvedValue(undefined);
    const setActiveThread = vi.fn<WorkspaceApi["setActiveThread"]>();

    window.workspaceApi = {
      getSnapshot,
      changedFiles: vi.fn().mockResolvedValue([]),
      isGitRepository: vi.fn().mockResolvedValue(true),
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive,
      createThread: vi.fn(),
      setActiveThread,
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    const fileSearchEditorBeforeSwitchText = wrapper.get('[data-testid="file-search-editor"]').text();
    expect(fileSearchEditorBeforeSwitchText).toContain("/tmp/instrument-feature-a");
    expect(fileSearchEditorBeforeSwitchText).toContain("feature-a");

    await wrapper.get('[data-thread-id="thread-1"]').trigger("click");
    await flushPromises();

    expect(setActive).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreeId: "worktree-1",
      threadId: "thread-1"
    });
    expect(setActiveThread).not.toHaveBeenCalled();
    const fileSearchEditorAfterSwitchText = wrapper.get('[data-testid="file-search-editor"]').text();
    expect(fileSearchEditorAfterSwitchText).toContain("/tmp/instrument");
    expect(fileSearchEditorAfterSwitchText).toContain("Primary");
  });

  it("binds Files to the active worktree path even if the active thread points elsewhere", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const snapshot = makeMultiWorktreeSnapshot();
    snapshot.activeWorktreeId = "worktree-1";
    snapshot.activeThreadId = "thread-2";
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(snapshot);

    window.workspaceApi = {
      getSnapshot,
      changedFiles: vi.fn().mockResolvedValue([]),
      isGitRepository: vi.fn().mockResolvedValue(true),
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive: vi.fn(),
      createThread: vi.fn(),
      setActiveThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    const fileSearchEditorText = wrapper.get('[data-testid="file-search-editor"]').text();
    expect(fileSearchEditorText).toContain("/tmp/instrument");
    expect(fileSearchEditorText).toContain("Primary");
  });

  it("cancels a dirty Files worktree switch before changing the active worktree", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const snapshot = makeMultiWorktreeSnapshot();
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(snapshot);
    const setActive = vi.fn<WorkspaceApi["setActive"]>().mockResolvedValue(undefined);
    mockFileSearchConfirmContextSwitch.mockResolvedValueOnce(false);

    window.workspaceApi = {
      getSnapshot,
      changedFiles: vi.fn().mockResolvedValue([]),
      isGitRepository: vi.fn().mockResolvedValue(true),
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive,
      createThread: vi.fn(),
      setActiveThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    await wrapper.get('[data-testid="launcher-pick-worktree-1"]').trigger("click");
    await flushPromises();

    expect(mockFileSearchConfirmContextSwitch).toHaveBeenCalledWith("/tmp/instrument");
    expect(setActive).not.toHaveBeenCalled();
    const fileSearchEditorText = wrapper.get('[data-testid="file-search-editor"]').text();
    expect(fileSearchEditorText).toContain("/tmp/instrument-feature-a");
    expect(fileSearchEditorText).toContain("feature-a");
  });

  it("restores lastActiveThreadId when manually switching worktrees and falls back to the first thread otherwise", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const initialSnapshot = makeMultiWorktreeSnapshot();
    initialSnapshot.worktrees[0] = {
      ...initialSnapshot.worktrees[0]!,
      lastActiveThreadId: null
    };
    initialSnapshot.activeWorktreeId = "worktree-1";
    initialSnapshot.activeThreadId = "thread-1";
    const afterSwitchToWorktree2: WorkspaceSnapshot = {
      ...initialSnapshot,
      activeWorktreeId: "worktree-2",
      activeThreadId: "thread-2"
    };
    const afterSwitchBackToWorktree1: WorkspaceSnapshot = {
      ...initialSnapshot,
      activeWorktreeId: "worktree-1",
      activeThreadId: "thread-1"
    };
    const getSnapshot = vi
      .fn<WorkspaceApi["getSnapshot"]>()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(afterSwitchToWorktree2)
      .mockResolvedValueOnce(afterSwitchBackToWorktree1);
    const setActive = vi.fn<WorkspaceApi["setActive"]>().mockResolvedValue(undefined);

    window.workspaceApi = {
      getSnapshot,
      changedFiles: vi.fn().mockResolvedValue([]),
      isGitRepository: vi.fn().mockResolvedValue(true),
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive,
      createThread: vi.fn(),
      setActiveThread: vi.fn(),
      deleteThread: vi.fn(),
      renameThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    await wrapper.get('[data-testid="launcher-pick-worktree-2"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="launcher-pick-worktree-1"]').trigger("click");
    await flushPromises();

    expect(setActive).toHaveBeenNthCalledWith(1, {
      projectId: "project-1",
      worktreeId: "worktree-2",
      threadId: "thread-2"
    });
    expect(setActive).toHaveBeenNthCalledWith(2, {
      projectId: "project-1",
      worktreeId: "worktree-1",
      threadId: "thread-1"
    });
  });

  it("hides the Git Diff tab and shows a no-Git empty state when the worktree is not a repository", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const getSnapshot = vi.fn<WorkspaceApi["getSnapshot"]>().mockResolvedValue(makeSnapshot("Codex CLI"));
    const changedFiles = vi.fn<WorkspaceApi["changedFiles"]>().mockResolvedValue([]);
    const isGitRepository = vi.fn<NonNullable<WorkspaceApi["isGitRepository"]>>().mockResolvedValue(false);

    window.workspaceApi = {
      getSnapshot,
      changedFiles,
      isGitRepository,
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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

    expect(isGitRepository).toHaveBeenCalledWith("/tmp/instrument");
    expect(wrapper.find('[data-testid="workspace-no-git-empty-state"]').exists()).toBe(true);
    const gitDiffTab = wrapper.findAll("button").find((b) => b.text().includes("Git Diff"));
    expect(gitDiffTab).toBeUndefined();
  });

  it("confirms before removing a project from the workspace tabs and refreshes the snapshot", async () => {
    const { default: WorkspaceLayout } = await import("../WorkspaceLayout.vue");
    const initialSnapshot: WorkspaceSnapshot = {
      ...makeSnapshot("Codex CLI"),
      projects: [
        {
          id: "project-1",
          name: "instrument",
          repoPath: "/tmp/instrument",
          status: "idle",
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z"
        },
        {
          id: "project-2",
          name: "posthog-client",
          repoPath: "/tmp/posthog-client",
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
          isDefault: true,
          baseBranch: null,
          lastActiveThreadId: "thread-1",
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z"
        },
        {
          id: "worktree-2",
          projectId: "project-2",
          name: "main",
          branch: "main",
          path: "/tmp/posthog-client",
          isActive: true,
          isDefault: true,
          baseBranch: null,
          lastActiveThreadId: "thread-2",
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z"
        }
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          worktreeId: "worktree-1",
          title: "Codex CLI",
          agent: "codex",
          sortOrder: 0,
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z"
        },
        {
          id: "thread-2",
          projectId: "project-2",
          worktreeId: "worktree-2",
          title: "Other workspace",
          agent: "codex",
          sortOrder: 0,
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:00.000Z"
        }
      ],
      threadSessions: [],
      activeProjectId: "project-1",
      activeWorktreeId: "worktree-1",
      activeThreadId: "thread-1"
    };
    const afterRemovalSnapshot: WorkspaceSnapshot = {
      ...initialSnapshot,
      projects: [initialSnapshot.projects[1]],
      worktrees: [initialSnapshot.worktrees[1]],
      threads: [initialSnapshot.threads[1]],
      activeProjectId: "project-2",
      activeWorktreeId: "worktree-2",
      activeThreadId: "thread-2"
    };
    const getSnapshot = vi
      .fn<WorkspaceApi["getSnapshot"]>()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(afterRemovalSnapshot);
    const removeProject = vi.fn<WorkspaceApi["removeProject"]>().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    window.workspaceApi = {
      getSnapshot,
      removeProject,
      changedFiles: vi.fn().mockResolvedValue([]),
      isGitRepository: vi.fn().mockResolvedValue(true),
      addProject: vi.fn(),
      addWorktree: vi.fn(),
      setActive: vi.fn(),
      createThread: vi.fn(),
      reorderThreads: vi.fn(),
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
      createFolder: vi.fn(),
      deleteFolder: vi.fn(),
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
    await wrapper.get('[data-remove-project-id="project-1"]').trigger("click");
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith("Remove instrument from workspace tabs?");
    expect(removeProject).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[data-testid="thread-sidebar"]').text()).toContain("Other workspace");

    confirmSpy.mockRestore();
  });

});
