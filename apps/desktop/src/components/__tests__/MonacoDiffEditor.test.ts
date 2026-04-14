import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonacoDiffEditor from "../MonacoDiffEditor.vue";

// ── Monaco mock ──────────────────────────────────────────────────────────────
const mockOrigModel = { dispose: vi.fn() };
const mockModModel = { dispose: vi.fn(), getValueInRange: vi.fn(() => "") };

const mockOrigEditor = {
  getModel: vi.fn(() => mockOrigModel),
};

const mockModEditor = {
  getModel: vi.fn(() => mockModModel),
  getDomNode: vi.fn(() => document.createElement("div")),
  getScrolledVisiblePosition: vi.fn(() => ({ left: 0, top: 0, height: 14 })),
  onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
};

const mockDiffEditor = {
  getOriginalEditor: vi.fn(() => mockOrigEditor),
  getModifiedEditor: vi.fn(() => mockModEditor),
  setModel: vi.fn(),
  updateOptions: vi.fn(),
  dispose: vi.fn(),
};

vi.mock("monaco-editor", () => ({
  editor: {
    createDiffEditor: vi.fn(() => mockDiffEditor),
    createModel: vi.fn((value: string) => ({ value, dispose: vi.fn() })),
    setTheme: vi.fn(),
  },
}));

vi.mock("@/components/contextQueue/ContextQueueSelectionPopup.vue", () => ({
  default: { template: "<div />" },
}));
// ─────────────────────────────────────────────────────────────────────────────

describe("MonacoDiffEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a host div", () => {
    const wrapper = mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts" },
    });
    expect(wrapper.find(".monaco-diff-host").exists()).toBe(true);
  });

  it("calls createDiffEditor on mount", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts" },
    });
    expect(editor.createDiffEditor).toHaveBeenCalled();
  });

  it("calls setModel with original and modified content", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "original content", modified: "modified content", filePath: "src/foo.ts" },
    });
    expect(editor.createModel).toHaveBeenCalledWith("original content", expect.any(String));
    expect(editor.createModel).toHaveBeenCalledWith("modified content", expect.any(String));
    expect(mockDiffEditor.setModel).toHaveBeenCalled();
  });

  it("sets renderSideBySide:true for split layout", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts", layout: "split" },
    });
    expect(editor.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ renderSideBySide: true })
    );
  });

  it("sets renderSideBySide:false for unified layout", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts", layout: "unified" },
    });
    expect(editor.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ renderSideBySide: false })
    );
  });

  it("calls updateOptions when layout prop changes", async () => {
    const wrapper = mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts", layout: "split" },
    });
    await wrapper.setProps({ layout: "unified" });
    expect(mockDiffEditor.updateOptions).toHaveBeenCalledWith({ renderSideBySide: false });
  });

  it("disposes the diff editor on unmount", () => {
    const wrapper = mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts" },
    });
    wrapper.unmount();
    expect(mockDiffEditor.dispose).toHaveBeenCalled();
  });
});
