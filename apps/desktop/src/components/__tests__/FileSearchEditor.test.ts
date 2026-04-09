import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileSearchEditor from "../FileSearchEditor.vue";

vi.mock("@/components/ui/Button.vue", () => ({
  default: { template: "<button v-bind=\"$attrs\"><slot /></button>" }
}));

vi.mock("@/components/CodeMirrorEditor.vue", () => ({
  default: defineComponent({
    name: "CodeMirrorEditor",
    props: {
      modelValue: { type: String, default: "" },
      language: String,
      ariaLabel: String
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("textarea", {
          "data-testid": "file-editor",
          class: "file-editor-textarea",
          value: props.modelValue,
          "data-language": props.language ?? undefined,
          "aria-label": props.ariaLabel ?? undefined,
          spellcheck: false,
          onInput: (e: Event) =>
            emit("update:modelValue", (e.target as HTMLTextAreaElement).value)
        });
    }
  })
}));

describe("FileSearchEditor", () => {
  const listFiles = vi.fn<WorkspaceApi["listFiles"]>();
  const readFile = vi.fn<WorkspaceApi["readFile"]>();
  const writeFile = vi.fn<WorkspaceApi["writeFile"]>();
  const createFile = vi.fn<WorkspaceApi["createFile"]>();
  const deleteFile = vi.fn<WorkspaceApi["deleteFile"]>();
  const createFolder = vi.fn<WorkspaceApi["createFolder"]>();
  const deleteFolder = vi.fn<WorkspaceApi["deleteFolder"]>();
  let onWorkspaceChangedCb: (() => void) | null = null;
  let onWorkingTreeFilesChangedCb: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem("instrument.fileSearchSidebarCollapsed");
    listFiles.mockReset();
    readFile.mockReset();
    writeFile.mockReset();
    createFile.mockReset();
    deleteFile.mockReset();
    createFolder.mockReset();
    deleteFolder.mockReset();
    onWorkspaceChangedCb = null;
    onWorkingTreeFilesChangedCb = null;

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
      createFolder,
      deleteFolder,
      applyPatch: vi.fn(),
      ptyCreate: vi.fn(),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      onWorkspaceChanged: vi.fn((cb: () => void) => {
        onWorkspaceChangedCb = cb;
        return () => {};
      }),
      onWorkingTreeFilesChanged: vi.fn((cb: () => void) => {
        onWorkingTreeFilesChangedCb = cb;
        return () => {};
      }),
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

  it("does not render workspace context in the file editor header", async () => {
    listFiles.mockResolvedValue([]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="file-editor-workspace-context"]').exists()).toBe(false);
  });

  it("refreshes file explorer when the refresh control is clicked", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 11, modifiedAt: 1 }])
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 11, modifiedAt: 1 }]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="refresh-file-explorer"]').trigger("click");
    await flushPromises();

    expect(listFiles).toHaveBeenCalledTimes(2);
    expect(listFiles).toHaveBeenNthCalledWith(2, "/tmp/project");
  });

  it("auto-refreshes file explorer on workspace and working-tree change events", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 11, modifiedAt: 1 }])
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 11, modifiedAt: 2 }])
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 11, modifiedAt: 3 }]);

    mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });
    await flushPromises();

    expect(onWorkspaceChangedCb).toBeTypeOf("function");
    expect(onWorkingTreeFilesChangedCb).toBeTypeOf("function");

    onWorkspaceChangedCb?.();
    await flushPromises();
    onWorkingTreeFilesChangedCb?.();
    await flushPromises();

    expect(listFiles).toHaveBeenCalledTimes(3);
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

  it("collapses and expands the file sidebar", async () => {
    listFiles.mockResolvedValue([]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="file-search-input"]').exists()).toBe(true);

    await wrapper.get('[data-testid="file-search-sidebar-collapse"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="file-search-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="file-search-sidebar-expand"]').exists()).toBe(true);

    await wrapper.get('[data-testid="file-search-sidebar-expand"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="file-search-input"]').exists()).toBe(true);
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

  it("left-aligns file tree row labels", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/App.vue", size: 11, modifiedAt: 1 },
      { relativePath: "src/features/FileSearchEditor.vue", size: 11, modifiedAt: 2 }
    ]);

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="folder-toggle-src"]').classes()).toContain("justify-start");

    await wrapper.get('[data-testid="folder-toggle-src/features"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="file-node-src/features/FileSearchEditor.vue"]').classes()).toContain(
      "justify-start"
    );
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

  it("opens a discard dialog before switching files when the current draft is dirty", async () => {
    listFiles.mockResolvedValue([
      { relativePath: "src/one.ts", size: 7, modifiedAt: 1 },
      { relativePath: "src/two.ts", size: 7, modifiedAt: 2 },
      { relativePath: "src/nested/three.ts", size: 9, modifiedAt: 3 }
    ]);
    readFile.mockResolvedValue("content");

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();
      await wrapper.get('[data-testid="file-node-src/one.ts"]').trigger("click");
      await flushPromises();
      await wrapper.get('[data-testid="file-editor"]').setValue("changed");

      await wrapper.get('[data-testid="file-node-src/two.ts"]').trigger("click");
      await flushPromises();

      const dialog = document.querySelector('[data-testid="confirm-action-dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.textContent).toContain("Discard unsaved changes?");

      const cancel = document.querySelector('[data-testid="confirm-action-cancel"]') as HTMLButtonElement;
      expect(cancel).toBeTruthy();
      cancel.click();
      await flushPromises();

      expect(readFile).toHaveBeenCalledTimes(1);
      expect(wrapper.get('[data-testid="file-editor-active-path"]').text()).toContain("src/one.ts");
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps the original save target when a dirty worktree switch is canceled", async () => {
    listFiles.mockResolvedValue([{ relativePath: "src/one.ts", size: 7, modifiedAt: 1 }]);
    readFile.mockResolvedValue("original");
    writeFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project-a" },
      attachTo: document.body
    });

    try {
      await flushPromises();
      await wrapper.get('[data-testid="file-node-src/one.ts"]').trigger("click");
      await flushPromises();
      await wrapper.get('[data-testid="file-editor"]').setValue("changed");

      const confirmSwitch = (
        wrapper.vm as unknown as {
          confirmContextSwitch: (nextWorktreePath: string | null) => Promise<boolean>;
        }
      ).confirmContextSwitch("/tmp/project-b");
      await flushPromises();

      const cancel = document.querySelector(
        '[data-testid="confirm-action-cancel"]'
      ) as HTMLButtonElement;
      expect(cancel).toBeTruthy();
      cancel.click();

      await expect(confirmSwitch).resolves.toBe(false);

      await wrapper.get('[data-testid="save-file"]').trigger("click");
      await flushPromises();

      expect(writeFile).toHaveBeenCalledWith("/tmp/project-a", "src/one.ts", "changed");
      expect(wrapper.get('[data-testid="file-editor-active-path"]').text()).toContain("src/one.ts");
    } finally {
      wrapper.unmount();
    }
  });

  it("ignores stale file reads when a newer selection resolves later", async () => {
    let resolveFirstRead: ((value: string) => void) | null = null;
    let resolveSecondRead: ((value: string) => void) | null = null;

    listFiles.mockResolvedValue([
      { relativePath: "src/one.ts", size: 7, modifiedAt: 1 },
      { relativePath: "src/two.ts", size: 7, modifiedAt: 2 }
    ]);
    readFile
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirstRead = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveSecondRead = resolve;
          })
      );

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" }
    });

    await flushPromises();
    await wrapper.get('[data-testid="file-node-src/one.ts"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="file-node-src/two.ts"]').trigger("click");
    await nextTick();

    resolveSecondRead?.("two");
    await flushPromises();

    expect(wrapper.get('[data-testid="file-editor-active-path"]').text()).toContain("src/two.ts");
    expect((wrapper.get('[data-testid="file-editor"]').element as HTMLTextAreaElement).value).toBe(
      "two"
    );

    resolveFirstRead?.("one");
    await flushPromises();

    expect(wrapper.get('[data-testid="file-editor-active-path"]').text()).toContain("src/two.ts");
    expect((wrapper.get('[data-testid="file-editor"]').element as HTMLTextAreaElement).value).toBe(
      "two"
    );
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

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();
      await wrapper.get('[data-testid="add-file"]').trigger("click");
      await flushPromises();
      await nextTick();

      const pathInput = document.querySelector(
        '[data-testid="new-file-path-input"]'
      ) as HTMLInputElement;
      expect(pathInput).toBeTruthy();
      pathInput.value = "src/new.ts";
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));

      const confirm = document.querySelector('[data-testid="new-file-confirm"]') as HTMLButtonElement;
      expect(confirm).toBeTruthy();
      confirm.click();
      await flushPromises();

      expect(createFile).toHaveBeenCalledWith("/tmp/project", "src/new.ts");
      expect(listFiles).toHaveBeenCalledTimes(2);
      expect(readFile).toHaveBeenCalledWith("/tmp/project", "src/new.ts");
    } finally {
      wrapper.unmount();
    }
  });

  it("deletes the selected file only after confirming in the dialog", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/one.ts", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([]);
    readFile.mockResolvedValue("x");
    deleteFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();
      await wrapper.get('[data-testid="file-node-src/one.ts"]').trigger("click");
      await flushPromises();
      await wrapper.get('[data-testid="delete-file"]').trigger("click");
      await flushPromises();

      expect(deleteFile).not.toHaveBeenCalled();
      expect(document.querySelector('[data-testid="confirm-action-dialog"]')?.textContent).toContain(
        "Delete src/one.ts?"
      );

      const confirm = document.querySelector('[data-testid="confirm-action-confirm"]') as HTMLButtonElement;
      expect(confirm).toBeTruthy();
      confirm.click();
      await flushPromises();

      expect(deleteFile).toHaveBeenCalledWith("/tmp/project", "src/one.ts");
      expect(listFiles).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain("No file");
    } finally {
      wrapper.unmount();
    }
  });

  it("opens the tree pane context menu to add a file", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([
        { relativePath: "src/App.vue", size: 1, modifiedAt: 1 },
        { relativePath: "src/pane-new.ts", size: 0, modifiedAt: 2 }
      ]);
    readFile.mockResolvedValue("");
    createFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();

      await wrapper.get('[data-testid="file-tree-scroll"]').trigger("contextmenu", {
        clientX: 40,
        clientY: 40
      });
      await flushPromises();
      await nextTick();

      const addItem = document.querySelector('[data-testid="ctx-add-file"]');
      expect(addItem).toBeTruthy();
      (addItem as HTMLButtonElement).click();
      await flushPromises();
      await nextTick();

      const pathInput = document.querySelector(
        '[data-testid="new-file-path-input"]'
      ) as HTMLInputElement;
      expect(pathInput).toBeTruthy();
      pathInput.value = "src/pane-new.ts";
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));
      (document.querySelector('[data-testid="new-file-confirm"]') as HTMLButtonElement).click();
      await flushPromises();

      expect(createFile).toHaveBeenCalledWith("/tmp/project", "src/pane-new.ts");
    } finally {
      wrapper.unmount();
    }
  });

  it("uses the folder path when adding a file from a folder context menu", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([
        { relativePath: "src/App.vue", size: 1, modifiedAt: 1 },
        { relativePath: "src/ctx-new.ts", size: 0, modifiedAt: 2 }
      ]);
    readFile.mockResolvedValue("");
    createFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();

      await wrapper.get('[data-testid="folder-toggle-src"]').trigger("contextmenu", {
        clientX: 4,
        clientY: 4
      });
      await flushPromises();
      await nextTick();

      const addItem = document.querySelector('[data-testid="ctx-add-file"]');
      expect(addItem).toBeTruthy();
      (addItem as HTMLButtonElement).click();
      await flushPromises();
      await nextTick();

      const pathInput = document.querySelector(
        '[data-testid="new-file-path-input"]'
      ) as HTMLInputElement;
      expect(pathInput).toBeTruthy();
      expect(pathInput.value).toBe("src/");
      pathInput.value = "src/ctx-new.ts";
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));
      (document.querySelector('[data-testid="new-file-confirm"]') as HTMLButtonElement).click();
      await flushPromises();

      expect(createFile).toHaveBeenCalledWith("/tmp/project", "src/ctx-new.ts");
    } finally {
      wrapper.unmount();
    }
  });

  it("deletes a file from the file row context menu only after confirming", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/only.ts", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([]);
    deleteFile.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();

      await wrapper.get('[data-testid="file-node-src/only.ts"]').trigger("contextmenu", {
        clientX: 2,
        clientY: 2
      });
      await flushPromises();
      await nextTick();

      const del = document.querySelector('[data-testid="ctx-delete-file"]');
      expect(del).toBeTruthy();
      (del as HTMLButtonElement).click();
      await flushPromises();

      const confirm = document.querySelector('[data-testid="confirm-action-confirm"]') as HTMLButtonElement;
      expect(confirm).toBeTruthy();
      confirm.click();
      await flushPromises();

      expect(deleteFile).toHaveBeenCalledWith("/tmp/project", "src/only.ts");
      expect(wrapper.text()).toContain("No file");
    } finally {
      wrapper.unmount();
    }
  });

  it("creates a folder from the add-folder control", async () => {
    listFiles
      .mockResolvedValueOnce([{ relativePath: "src/App.vue", size: 1, modifiedAt: 1 }])
      .mockResolvedValueOnce([
        { relativePath: "src", kind: "directory", size: 0, modifiedAt: 1 },
        { relativePath: "src/App.vue", size: 1, modifiedAt: 1 },
        { relativePath: "src/new-dir", kind: "directory", size: 0, modifiedAt: 2 }
      ]);
    createFolder.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();
      await wrapper.get('[data-testid="add-folder"]').trigger("click");
      await flushPromises();
      await nextTick();

      const pathInput = document.querySelector(
        '[data-testid="new-folder-path-input"]'
      ) as HTMLInputElement;
      expect(pathInput).toBeTruthy();
      pathInput.value = "src/new-dir";
      pathInput.dispatchEvent(new Event("input", { bubbles: true }));

      (document.querySelector('[data-testid="new-folder-confirm"]') as HTMLButtonElement).click();
      await flushPromises();

      expect(createFolder).toHaveBeenCalledWith("/tmp/project", "src/new-dir");
      expect(listFiles).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
    }
  });

  it("deletes a folder from the folder context menu only after confirming", async () => {
    listFiles
      .mockResolvedValueOnce([
        { relativePath: "src", kind: "directory", size: 0, modifiedAt: 1 },
        { relativePath: "src/App.vue", size: 1, modifiedAt: 1 }
      ])
      .mockResolvedValueOnce([]);
    deleteFolder.mockResolvedValue();

    const wrapper = mount(FileSearchEditor, {
      props: { worktreePath: "/tmp/project" },
      attachTo: document.body
    });

    try {
      await flushPromises();

      await wrapper.get('[data-testid="folder-toggle-src"]').trigger("contextmenu", {
        clientX: 4,
        clientY: 4
      });
      await flushPromises();
      await nextTick();

      const del = document.querySelector('[data-testid="ctx-delete-folder"]');
      expect(del).toBeTruthy();
      (del as HTMLButtonElement).click();
      await flushPromises();

      const dialog = document.querySelector('[data-testid="confirm-action-dialog"]');
      expect(dialog?.textContent).toContain("Delete folder src and its contents?");

      const confirm = document.querySelector('[data-testid="confirm-action-confirm"]') as HTMLButtonElement;
      expect(confirm).toBeTruthy();
      confirm.click();
      await flushPromises();

      expect(deleteFolder).toHaveBeenCalledWith("/tmp/project", "src");
      expect(listFiles).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
    }
  });
});
