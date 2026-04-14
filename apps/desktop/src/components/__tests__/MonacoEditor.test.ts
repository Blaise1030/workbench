import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonacoEditor from "../MonacoEditor.vue";

// ── Monaco mock ──────────────────────────────────────────────────────────────
const mockModel = {
  dispose: vi.fn(),
};

const mockEditor = {
  getValue: vi.fn(() => "initial"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  onDidChangeModelContent: vi.fn((cb) => {
    mockEditor._contentListener = cb;
    return { dispose: vi.fn() };
  }),
  onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
  onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  getModel: vi.fn(() => mockModel),
  getDomNode: vi.fn(() => document.createElement("div")),
  getSelection: vi.fn(() => null),
  getScrolledVisiblePosition: vi.fn(() => ({ left: 0, top: 0, height: 14 })),
  updateOptions: vi.fn(),
  trigger: vi.fn(),
  _contentListener: null as ((e: unknown) => void) | null,
};

vi.mock("@/lib/monacoApi", () => ({
  monaco: {
    editor: {
      create: vi.fn(() => mockEditor),
      setTheme: vi.fn(),
      setModelLanguage: vi.fn(),
    },
  },
}));
// ─────────────────────────────────────────────────────────────────────────────

describe("MonacoEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a host div with data-testid=file-editor", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "hello", language: "typescript" },
    });
    expect(wrapper.find('[data-testid="file-editor"]').exists()).toBe(true);
  });

  it("sets data-language from the language prop", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "", language: "typescript" },
    });
    expect(wrapper.find('[data-testid="file-editor"]').attributes("data-language")).toBe("typescript");
  });

  it("emits update:modelValue when editor content changes", async () => {
    const { monaco } = await import("@/lib/monacoApi");
    const { editor } = monaco;
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "hello" },
    });
    // Simulate editor content change
    mockEditor.getValue.mockReturnValue("world");
    mockEditor._contentListener?.({});
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["world"]);
    (editor as { create: ReturnType<typeof vi.fn> }).create;
  });

  it("calls setValue when modelValue prop changes externally", async () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "hello" },
    });
    mockEditor.getValue.mockReturnValue("hello"); // matches, no setValue
    await wrapper.setProps({ modelValue: "hello" });
    expect(mockEditor.setValue).not.toHaveBeenCalled();

    mockEditor.getValue.mockReturnValue("hello"); // current value
    await wrapper.setProps({ modelValue: "world" });
    expect(mockEditor.setValue).toHaveBeenCalledWith("world");
  });

  it("exposes openFind which calls editor.trigger", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "" },
    });
    (wrapper.vm as { openFind: () => void }).openFind();
    expect(mockEditor.trigger).toHaveBeenCalledWith("keyboard", "actions.find", null);
  });

  it("calls editor.dispose on unmount", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "" },
    });
    wrapper.unmount();
    expect(mockEditor.dispose).toHaveBeenCalled();
  });
});
