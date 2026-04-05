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
  const createFile = vi.fn<WorkspaceApi["createFile"]>();
  const deleteFile = vi.fn<WorkspaceApi["deleteFile"]>();

  beforeEach(() => {
    vi.useFakeTimers();
    listFiles.mockReset();
    readFile.mockReset();
    writeFile.mockReset();
    createFile.mockReset();
    deleteFile.mockReset();

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
      searchFiles: vi.fn(),
      readFile,
      writeFile,
      createFile,
      deleteFile,
      applyPatch: vi.fn(),
      ptyCreate: vi.fn(),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      onWorkspaceChanged: vi.fn(() => () => {}),
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
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    expect(listFiles).toHaveBeenCalledWith("/tmp/project");
    expect(wrapper.text()).toContain("src");
    expect(wrapper.text()).toContain("App.vue");
    expect(wrapper.text()).not.toContain("FileSearchEditor.vue");
  });

  it("renders the search input with the updated field styling", async () => {
    listFiles.mockResolvedValue([]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    const input = wrapper.get('[data-testid="file-search-input"]');
    expect(input.classes()).toContain("h-7");
    expect(input.classes()).toContain("rounded-md");
    expect(input.classes()).toContain("border");
    expect(input.classes()).toContain("bg-background");
    expect(input.classes()).toContain("focus-visible:ring-2");
    expect(input.classes()).toContain("disabled:bg-input/50");
  });

  it("renders a thinner editor header", async () => {
    listFiles.mockResolvedValue([]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    const header = wrapper.get('[data-testid="file-editor-header"]');
    expect(header.classes()).toContain("py-1.5");
  });

  it("renders the search bar row at the same compact header height", async () => {
    listFiles.mockResolvedValue([]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    const header = wrapper.get('[data-testid="file-search-header"]');
    expect(header.classes()).toContain("p-1");
  });

  it("toggles folders open and closed", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/App.vue", size: 11, modifiedAt: 1 },
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    expect(wrapper.text()).not.toContain("FileSearchEditor.vue");

    await wrapper.get('[data-testid="folder-toggle-src/features"]').trigger("click");

    expect(wrapper.text()).toContain("FileSearchEditor.vue");

    await wrapper.get('[data-testid="folder-toggle-src/features"]').trigger("click");

    expect(wrapper.text()).not.toContain("FileSearchEditor.vue");
  });

  it("filters the preloaded summaries client-side while preserving ancestor folders", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/App.vue", size: 11, modifiedAt: 1 },
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-search-input"]').setValue("file");
    await flushPromises();

    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("src");
    expect(wrapper.text()).toContain("features");
    expect(wrapper.text()).toContain("FileSearchEditor.vue");
    expect(wrapper.text()).not.toContain("App.vue");
  });

  it("loads a file when a search result is selected", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("<template />");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="folder-toggle-src/features"]').trigger("click");
    await flushPromises();

    await wrapper.get('[data-testid="file-node-src/features/FileSearchEditor.vue"]').trigger("click");
    await flushPromises();

    expect(readFile).toHaveBeenCalledWith("/tmp/project", "src/features/FileSearchEditor.vue");
    expect((wrapper.get('[data-testid="file-editor"]').element as HTMLTextAreaElement).value).toBe(
      "<template />"
    );
  });

  it("marks the file dirty, saves it, and clears dirty state", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("<template />");
    writeFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="folder-toggle-src/features"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="file-node-src/features/FileSearchEditor.vue"]').trigger("click");
    await flushPromises();

    await wrapper.get('[data-testid="file-editor"]').setValue("<template>\n  edited\n</template>");

    expect(wrapper.text()).toContain("Unsaved changes");

    await wrapper.get('[data-testid="save-file"]').trigger("click");
    await flushPromises();

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/project",
      "src/features/FileSearchEditor.vue",
      "<template>\n  edited\n</template>"
    );
    expect(wrapper.text()).not.toContain("Unsaved changes");
  });

  it("reverts the draft back to the loaded content", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);
    readFile.mockResolvedValue("<template />");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="folder-toggle-src/features"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="file-node-src/features/FileSearchEditor.vue"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="file-editor"]').setValue("edited");

    await wrapper.get('[data-testid="revert-file"]').trigger("click");

    expect((wrapper.get('[data-testid="file-editor"]').element as HTMLTextAreaElement).value).toBe(
      "<template />"
    );
  });

  it("renders sanitized markdown preview for .md files on Read tab", async () => {
    listFiles.mockResolvedValue([{ relativePath: "README.md", size: 20, modifiedAt: 1 }]);
    readFile.mockResolvedValue("# Hello\n\n**Bold** text.");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-node-README.md"]').trigger("click");
    await flushPromises();

    const preview = wrapper.get('[data-testid="markdown-preview"]');
    expect(preview.element.innerHTML).toContain("Hello");
    expect(preview.element.innerHTML).toContain("<strong>");
    expect(preview.element.innerHTML).not.toContain("<script");
  });

  it("switches markdown from Read to Source to show the raw editor", async () => {
    listFiles.mockResolvedValue([{ relativePath: "note.md", size: 8, modifiedAt: 1 }]);
    readFile.mockResolvedValue("# x");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-node-note.md"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="markdown-preview"]').exists()).toBe(true);

    const tabs = wrapper.findAll('[role="tab"]');
    const source = tabs.find((t) => t.text().includes("Source"));
    expect(source).toBeDefined();
    await source!.trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="markdown-preview"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="file-editor"]').exists()).toBe(true);
  });

  it("asks for confirmation before switching files when the current draft is dirty", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/one.ts", size: 7, modifiedAt: 1 },
      { relativePath: "src/two.ts", size: 7, modifiedAt: 2 },
      { relativePath: "src/nested/three.ts", size: 9, modifiedAt: 3 }
    ]);
    readFile.mockResolvedValue("content");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-node-src/one.ts"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="file-editor"]').setValue("changed");

    await wrapper.get('[data-testid="file-node-src/two.ts"]').trigger("click");
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("creates a file from the add control and opens it", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([
        { relativePath: "src/App.vue", size: 1, modifiedAt: 1 },
        { relativePath: "src/new.ts", size: 0, modifiedAt: 2 }
      ]);
    readFile.mockResolvedValue("");
    createFile.mockResolvedValue();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("src/new.ts");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="add-file"]').trigger("click");
    await flushPromises();

    expect(promptSpy).toHaveBeenCalled();
    expect(createFile).toHaveBeenCalledWith("/tmp/project", "src/new.ts");
    expect(listFiles).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenCalledWith("/tmp/project", "src/new.ts");

    promptSpy.mockRestore();
  });

  it("deletes the selected file after confirmation", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/one.ts", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([]);
    readFile.mockResolvedValue("x");
    deleteFile.mockResolvedValue();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-node-src/one.ts"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="delete-file"]').trigger("click");
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith("Delete src/one.ts?");
    expect(deleteFile).toHaveBeenCalledWith("/tmp/project", "src/one.ts");
    expect(listFiles).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("No file selected");

    confirmSpy.mockRestore();
  });
});
