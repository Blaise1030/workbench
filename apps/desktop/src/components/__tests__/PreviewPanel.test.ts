import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewLoadStatePayload } from "@shared/ipc";
import PreviewPanel from "../PreviewPanel.vue";

function makePreviewApi() {
  let loadStateListener: ((payload: PreviewLoadStatePayload) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    loadStateListener = null;
  });
  return {
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    setUrl: vi.fn().mockResolvedValue(undefined),
    probeUrl: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    setBounds: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    onLoadState: vi.fn((cb: (payload: PreviewLoadStatePayload) => void) => {
      loadStateListener = cb;
      return unsubscribe;
    }),
    unsubscribe,
    emitLoadState(payload: PreviewLoadStatePayload) {
      loadStateListener?.(payload);
    }
  };
}

describe("PreviewPanel", () => {
  let previewApi: ReturnType<typeof makePreviewApi>;

  beforeEach(() => {
    previewApi = makePreviewApi();
    Object.defineProperty(window, "previewApi", { value: previewApi, writable: true, configurable: true });
  });

  it("renders the URL input with default localhost value", () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    const input = wrapper.find('[data-testid="preview-url-input"]');
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("http://localhost:3000");
    wrapper.unmount();
  });

  it("calls previewApi.show on mount", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await wrapper.vm.$nextTick();
    expect(previewApi.show).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("subscribes to previewApi.onLoadState on mount and unsubscribes on unmount", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    expect(previewApi.onLoadState).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(previewApi.unsubscribe).toHaveBeenCalledOnce();
  });

  it("calls previewApi.hide and disconnects ResizeObserver on unmount", async () => {
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();
    const originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: observeSpy,
      disconnect: disconnectSpy,
      unobserve: vi.fn()
    })) as unknown as typeof ResizeObserver;

    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    wrapper.unmount();

    expect(previewApi.hide).toHaveBeenCalledOnce();
    expect(disconnectSpy).toHaveBeenCalledOnce();

    window.ResizeObserver = originalResizeObserver;
  });

  it("shows a loading banner after Enter navigation", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("8080");
    await input.trigger("keydown.enter");
    await wrapper.vm.$nextTick();
    const banner = wrapper.find('[data-testid="preview-load-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("Loading");
    expect(banner.text()).toContain("http://localhost:8080");
    expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:8080");
    wrapper.unmount();
  });

  it("normalizes bare port to full URL and calls setUrl on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("8080");
    await input.trigger("keydown.enter");
    expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:8080");
    wrapper.unmount();
  });

  it("normalizes host-only input to full URL on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("localhost:5173");
    await input.trigger("keydown.enter");
    expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:5173");
    wrapper.unmount();
  });

  it("passes through a full URL unchanged on Enter", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    const input = wrapper.find('[data-testid="preview-url-input"]');
    await input.setValue("http://localhost:4000");
    await input.trigger("keydown.enter");
    expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:4000");
    wrapper.unmount();
  });

  it("calls previewApi.reload when reload button is clicked", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    await wrapper.find('[data-testid="preview-reload-btn"]').trigger("click");
    expect(previewApi.reload).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("renders the viewport placeholder div", () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    expect(wrapper.find('[data-testid="preview-viewport"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("shows HTTP error line when main reports httpError", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    previewApi.emitLoadState({
      kind: "httpError",
      url: "http://localhost:9/a",
      statusCode: 500,
      statusLine: "500 Internal Server Error"
    });
    await wrapper.vm.$nextTick();
    const banner = wrapper.find('[data-testid="preview-load-banner"]');
    expect(banner.text()).toContain("HTTP 500");
    expect(banner.text()).toContain("Internal Server Error");
    wrapper.unmount();
  });

  it("shows network failure when main reports failed", async () => {
    const wrapper = mount(PreviewPanel, { attachTo: document.body });
    await flushPromises();
    previewApi.emitLoadState({
      kind: "failed",
      url: "http://localhost:59999/",
      errorCode: -102,
      errorDescription: "ERR_CONNECTION_REFUSED"
    });
    await wrapper.vm.$nextTick();
    const banner = wrapper.find('[data-testid="preview-load-banner"]');
    expect(banner.text()).toContain("ERR_CONNECTION_REFUSED");
    expect(banner.text()).toContain("-102");
    wrapper.unmount();
  });
});
