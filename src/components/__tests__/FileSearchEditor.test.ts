import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileSearchEditor from "../FileSearchEditor.vue";

vi.mock("@/components/ui/BaseButton.vue", () => ({
  default: { template: "<button v-bind=\"$attrs\"><slot /></button>" }
}));

describe("FileSearchEditor", () => {
  const listFiles = vi.fn<WorkspaceApi["listFiles"]>();
  const readFile = vi.fn<WorkspaceApi["readFile"]>();
  const writeFile = vi.fn<WorkspaceApi["writeFile"]>();

  beforeEach(() => {
    vi.useFakeTimers();
    listFiles.mockReset();
    readFile.mockReset();
    writeFile.mockReset();

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
      workingTreeDiff: vi.fn(),
      stageAll: vi.fn(),
      discardAll: vi.fn(),
      listFiles,
      readFile,
      writeFile,
      applyPatch: vi.fn(),
      ptyCreate: vi.fn(),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      pickRepoDirectory: vi.fn()
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.workspaceApi;
  });

  it("loads all file summaries on mount", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/App.vue", size: 11, modifiedAt: 1 },
      { relativePath: "src/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    expect(listFiles).toHaveBeenCalledWith("/tmp/project");
    expect(wrapper.text()).toContain("src/App.vue");
    expect(wrapper.text()).toContain("src/FileSearchEditor.vue");
  });

  it("filters the preloaded summaries client-side while typing", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/App.vue", size: 11, modifiedAt: 1 },
      { relativePath: "src/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-search-input"]').setValue("file");
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();

    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain("src/App.vue");
    expect(wrapper.text()).toContain("src/FileSearchEditor.vue");
  });

  it("loads a file when a search result is selected", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("<template />");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    await wrapper.get('[data-testid="file-result"]').trigger("click");
    await flushPromises();

    expect(readFile).toHaveBeenCalledWith("/tmp/project", "src/FileSearchEditor.vue");
    expect((wrapper.get('[data-testid="file-editor"]').element as HTMLTextAreaElement).value).toBe(
      "<template />"
    );
  });

  it("marks the file dirty, saves it, and clears dirty state", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("<template />");
    writeFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-result"]').trigger("click");
    await flushPromises();

    await wrapper.get('[data-testid="file-editor"]').setValue("<template>\n  edited\n</template>");

    expect(wrapper.text()).toContain("Unsaved changes");

    await wrapper.get('[data-testid="save-file"]').trigger("click");
    await flushPromises();

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/project",
      "src/FileSearchEditor.vue",
      "<template>\n  edited\n</template>"
    );
    expect(wrapper.text()).not.toContain("Unsaved changes");
  });

  it("reverts the draft back to the loaded content", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("<template />");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-result"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="file-editor"]').setValue("edited");

    await wrapper.get('[data-testid="revert-file"]').trigger("click");

    expect((wrapper.get('[data-testid="file-editor"]').element as HTMLTextAreaElement).value).toBe(
      "<template />"
    );
  });

  it("asks for confirmation before switching files when the current draft is dirty", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/one.ts", size: 7, modifiedAt: 1 },
      { relativePath: "src/two.ts", size: 7, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("content");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.findAll('[data-testid="file-result"]')[0]!.trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="file-editor"]').setValue("changed");

    await wrapper.findAll('[data-testid="file-result"]')[1]!.trigger("click");
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
