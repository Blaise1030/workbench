import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TerminalPane from "@/components/TerminalPane.vue";

const fitMock = vi.fn();
const resetMock = vi.fn();
const writeMock = vi.fn();
const focusMock = vi.fn();
const disposeMock = vi.fn();
const onDataMock = vi.fn();
const onResizeMock = vi.fn();

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = fitMock;
  }
}));

vi.mock("xterm", () => ({
  Terminal: class {
    options: Record<string, unknown> = {};
    loadAddon(): void {}
    open(): void {}
    attachCustomKeyEventHandler(): void {}
    reset = resetMock;
    write = writeMock;
    focus = focusMock;
    dispose = disposeMock;
    onData = onDataMock;
    onResize = onResizeMock;
  }
}));

describe("TerminalPane", () => {
  beforeEach(() => {
    fitMock.mockReset();
    resetMock.mockReset();
    writeMock.mockReset();
    focusMock.mockReset();
    disposeMock.mockReset();
    onDataMock.mockReset();
    onResizeMock.mockReset();
    (document as Document & { fonts?: { ready: Promise<void> } }).fonts = { ready: Promise.resolve() };
  });

  afterEach(() => {
    delete window.workspaceApi;
  });

  function mountPaneWithPtyCreate(
    ptyCreate: WorkspaceApi["ptyCreate"],
    pendingAgentBootstrap: { threadId: string; command: string } | null
  ) {
    const ptyWrite = vi.fn<WorkspaceApi["ptyWrite"]>().mockResolvedValue(undefined);
    window.workspaceApi = {
      getSnapshot: vi.fn(),
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
      changedFiles: vi.fn(),
      fileDiff: vi.fn(),
      fileMergeSides: vi.fn().mockResolvedValue({
        kind: "ok" as const,
        original: "",
        modified: "",
        originalLabel: "HEAD",
        modifiedLabel: "Staged"
      }),
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
      ptyCreate,
      ptyWrite,
      ptyResize: vi.fn().mockResolvedValue(undefined),
      ptyKill: vi.fn().mockResolvedValue(undefined),
      onPtyData: vi.fn(() => () => {}),
      pickRepoDirectory: vi.fn()
    };

    const wrapper = mount(TerminalPane, {
      props: {
        worktreeId: "worktree-1",
        threadId: "thread-1",
        cwd: "/tmp/instrument",
        ptyKind: "agent",
        pendingAgentBootstrap
      },
      attachTo: document.body
    });

    return { wrapper, ptyWrite };
  }

  it("does not inject bootstrap when attaching to an existing PTY", async () => {
    const { wrapper, ptyWrite } = mountPaneWithPtyCreate(
      vi.fn<WorkspaceApi["ptyCreate"]>().mockResolvedValue({ buffer: "", created: false }),
      { threadId: "thread-1", command: "cursor agent --resume=abc" }
    );

    await flushPromises();

    expect(ptyWrite).not.toHaveBeenCalledWith("thread-1", "cursor agent --resume=abc\r");
    expect(wrapper.emitted("bootstrapConsumed")).toBeUndefined();
  });

  it("injects bootstrap once when creating a new PTY", async () => {
    const { wrapper, ptyWrite } = mountPaneWithPtyCreate(
      vi.fn<WorkspaceApi["ptyCreate"]>().mockResolvedValue({ buffer: "", created: true }),
      { threadId: "thread-1", command: "cursor agent --resume=abc" }
    );

    await flushPromises();

    expect(ptyWrite).toHaveBeenCalledWith("thread-1", "cursor agent --resume=abc\r");
    expect(wrapper.emitted("bootstrapConsumed")).toEqual([[]]);
  });
});
