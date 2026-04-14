import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewProbeResult } from "@shared/ipc";
import { setPreviewNativeCollisionEl, setPreviewNativeViewportTopPx } from "@/composables/previewNativeViewportTop";
import PreviewPanel from "../PreviewPanel.vue";

const { previewPanelWorkspaceStub } = vi.hoisted(() => {
  const { reactive } = require("vue") as typeof import("vue");
  const previewPanelWorkspaceStub = reactive<{ activeWorktreeId: string | null }>({
    activeWorktreeId: "wt-test-1"
  });
  return { previewPanelWorkspaceStub };
});

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: () => previewPanelWorkspaceStub
}));

function makePreviewApi() {
  return {
    probeUrl: vi.fn().mockResolvedValue({ ok: true, status: 200 } satisfies PreviewProbeResult),
    setNativeBounds: vi.fn().mockResolvedValue(undefined),
    loadNativeUrl: vi.fn().mockResolvedValue({ ok: true } as const),
    reloadNative: vi.fn().mockResolvedValue({ ok: true } as const),
    detachNative: vi.fn().mockResolvedValue(undefined),
    toggleEmbeddedDevTools: vi.fn().mockResolvedValue({ ok: true, open: true } as const),
    onPreviewEmbeddedDevtoolsOpen: vi.fn().mockReturnValue(() => {})
  };
}

async function flushPreviewNavigation(wrapper: ReturnType<typeof mount>): Promise<void> {
  await flushPromises();
  await wrapper.vm.$nextTick();
}

describe("PreviewPanel", () => {
  let previewApi: ReturnType<typeof makePreviewApi>;

  beforeEach(() => {
    localStorage.clear();
    setPreviewNativeViewportTopPx(null);
    setPreviewNativeCollisionEl(null);
    previewPanelWorkspaceStub.activeWorktreeId = "wt-test-1";
    previewApi = makePreviewApi();
    Object.defineProperty(window, "previewApi", { value: previewApi, writable: true, configurable: true });
  });

  it("renders the URL input empty by default", () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    const input = wrapper.find('[data-testid="preview-url-input"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("");
    wrapper.unmount();
  });

  it("uses the native preview layer (bounds IPC; detach on unmount)", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    expect(previewApi.setNativeBounds).toHaveBeenCalled();
    wrapper.unmount();
    expect(previewApi.detachNative).toHaveBeenCalled();
  });

  it("shows a loading badge after Enter navigation without exposing the URL", async () => {
    let finishLoad!: (v: { ok: true }) => void;
    const loadGate = new Promise<{ ok: true }>((resolve) => {
      finishLoad = resolve;
    });
    previewApi.loadNativeUrl.mockImplementationOnce(() => loadGate);
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("8080");
    await input.trigger("keydown.enter");
    await wrapper.vm.$nextTick();
    const badge = wrapper.find('[data-testid="preview-load-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("…");
    expect((badge.element as HTMLElement).getAttribute("title")).toBe("Loading…");
    expect(badge.text()).not.toMatch(/localhost|8080/);
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:8080");
    finishLoad!({ ok: true });
    await flushPreviewNavigation(wrapper);
    wrapper.unmount();
  });

  it("saves normalized URL to localStorage for the active worktree on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("8080");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    expect(localStorage.getItem("instrument.previewPanelUrl.wt-test-1")).toBe("http://localhost:8080");
    wrapper.unmount();
  });

  it("restores saved URL from localStorage when mounted", async () => {
    localStorage.setItem("instrument.previewPanelUrl.wt-test-1", "http://localhost:1111");
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    await wrapper.vm.$nextTick();
    expect((wrapper.find('[data-testid="preview-url-input"]').element as HTMLInputElement).value).toBe(
      "http://localhost:1111"
    );
    wrapper.unmount();
  });

  it("loads restored URL into the BrowserView when localStorage has a saved URL", async () => {
    localStorage.setItem("instrument.previewPanelUrl.wt-test-1", "http://localhost:1111");
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    await wrapper.vm.$nextTick();
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:1111");
    wrapper.unmount();
  });

  it("swaps input and preview URL when active worktree changes", async () => {
    localStorage.setItem("instrument.previewPanelUrl.wt-test-1", "http://localhost:1");
    localStorage.setItem("instrument.previewPanelUrl.wt-test-2", "http://localhost:2");
    previewPanelWorkspaceStub.activeWorktreeId = "wt-test-1";
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    await wrapper.vm.$nextTick();
    expect((wrapper.find('[data-testid="preview-url-input"]').element as HTMLInputElement).value).toBe(
      "http://localhost:1"
    );
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:1");
    previewPanelWorkspaceStub.activeWorktreeId = "wt-test-2";
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await flushPreviewNavigation(wrapper);
    expect((wrapper.find('[data-testid="preview-url-input"]').element as HTMLInputElement).value).toBe(
      "http://localhost:2"
    );
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:2");
    wrapper.unmount();
  });

  it("does not load a preview when Enter on empty input", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    await wrapper.vm.$nextTick();
    const loadsBefore = previewApi.loadNativeUrl.mock.calls.length;
    await wrapper.find('[data-testid="preview-url-input"]').trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    expect(previewApi.loadNativeUrl.mock.calls.length).toBe(loadsBefore);
    wrapper.unmount();
  });

  it("normalizes bare port to full URL on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("8080");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:8080");
    wrapper.unmount();
  });

  it("normalizes host-only input to full URL on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("localhost:5173");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:5173");
    wrapper.unmount();
  });

  it("passes through a full URL unchanged on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("http://localhost:4000");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    expect(previewApi.loadNativeUrl).toHaveBeenCalledWith("http://localhost:4000");
    wrapper.unmount();
  });

  it("calls reloadNative on reload so probe can run again", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("http://localhost:7777");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    const probesAfterFirstLoad = previewApi.probeUrl.mock.calls.length;
    expect(probesAfterFirstLoad).toBeGreaterThan(0);
    await wrapper.find('[data-testid="preview-reload-btn"]').trigger("click");
    await flushPreviewNavigation(wrapper);
    expect(previewApi.reloadNative).toHaveBeenCalled();
    expect(previewApi.probeUrl.mock.calls.length).toBeGreaterThan(probesAfterFirstLoad);
    wrapper.unmount();
  });

  it("calls previewApi.toggleEmbeddedDevTools when devtools button is clicked", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("http://localhost:9999");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    await wrapper.find('[data-testid="preview-devtools-btn"]').trigger("click");
    await flushPreviewNavigation(wrapper);
    expect(previewApi.toggleEmbeddedDevTools).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders the preview viewport", () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    expect(wrapper.find('[data-testid="preview-viewport"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("shows HTTP error badge after load when probe reports status >= 400", async () => {
    previewApi.probeUrl.mockResolvedValue({ ok: true, status: 500 });
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("http://localhost:9/a");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    const badge = wrapper.find('[data-testid="preview-load-badge"]');
    expect(badge.text()).toContain("HTTP 500");
    expect((badge.element as HTMLElement).getAttribute("title")).toMatch(/HTTP 500/);
    expect(badge.text()).not.toContain("localhost");
    wrapper.unmount();
  });

  it("shows network failure badge when probe fails", async () => {
    previewApi.probeUrl.mockResolvedValue({
      ok: false,
      code: "network",
      message: "ERR_CONNECTION_REFUSED"
    });
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("http://localhost:59999/");
    await input.trigger("keydown.enter");
    await flushPreviewNavigation(wrapper);
    const badge = wrapper.find('[data-testid="preview-load-badge"]');
    expect((badge.element as HTMLElement).getAttribute("title")).toContain("ERR_CONNECTION_REFUSED");
    expect(badge.text()).not.toContain("localhost");
    wrapper.unmount();
  });

  it("disconnects ResizeObserver on unmount", async () => {
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();
    const originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: observeSpy,
      disconnect: disconnectSpy,
      unobserve: vi.fn()
    })) as unknown as typeof ResizeObserver;

    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPreviewNavigation(wrapper);
    wrapper.unmount();

    expect(disconnectSpy).toHaveBeenCalledOnce();

    window.ResizeObserver = originalResizeObserver;
  });
});
