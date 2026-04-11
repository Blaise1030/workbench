import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ThreadTopBar from "@/components/ThreadTopBar.vue";

describe("ThreadTopBar", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadTopBar>>;
  const prevWorkspaceApi = window.workspaceApi;

  beforeEach(() => {
    setActivePinia(createPinia());
    window.workspaceApi = undefined;
  });

  afterEach(() => {
    wrapper?.unmount();
    window.workspaceApi = prevWorkspaceApi;
  });

  it("shows WORKBENCH and Alpha badges in the expanded header", () => {
    wrapper = mount(ThreadTopBar, { props: { contextLabel: "Primary" } });
    const brand = wrapper.get('[data-testid="thread-sidebar-brand"]');
    expect(brand.text()).toContain("WORKBENCH");
    expect(brand.text()).toContain("Alpha");
    expect(wrapper.get('[data-testid="thread-topbar-brand-badge"]').text()).toBe("WORKBENCH");
    expect(wrapper.get('[data-testid="thread-sidebar-alpha-badge"]').text()).toBe("Alpha");
  });

  it("renders the collapse toggle beside the title when expanded", async () => {
    wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");

    expect(wrapper.emitted("collapse")).toEqual([[]]);
  });

  it("renders the expand toggle below the title when collapsed", async () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true } });

    await wrapper.get('[aria-label="Expand threads sidebar"]').trigger("click");

    expect(wrapper.emitted("expand")).toEqual([[]]);
  });

  it("renders a slightly larger logo when collapsed", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true } });
    expect(wrapper.get('[data-testid="thread-sidebar-logo"]').classes()).toContain("size-8");
  });

  it("keeps the active context label in sr-only when collapsed (no visible tag)", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true, contextLabel: "feature-a" } });

    expect(wrapper.find('[data-testid="thread-topbar-context-label"]').exists()).toBe(false);
    expect(wrapper.get(".sr-only").text()).toContain("feature-a");
  });

  it("does not render the add-thread control in the top bar", () => {
    wrapper = mount(ThreadTopBar);

    expect(wrapper.find('[aria-label="New thread"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Add thread"]').exists()).toBe(false);
  });

  it("shows release tag on the second row when getAppReleaseTag resolves", async () => {
    window.workspaceApi = {
      getAppReleaseTag: async () => "v0.6.0"
    };
    wrapper = mount(ThreadTopBar, { props: { contextLabel: "Primary" } });
    await flushPromises();

    const versionEl = wrapper.get('[data-testid="thread-topbar-app-version"]');
    expect(versionEl.text()).toBe("v0.6.0");
    expect(versionEl.classes()).toContain("text-end");
    const row = versionEl.element.parentElement;
    expect(row?.querySelector('[data-testid="thread-sidebar-brand"]')).toBeTruthy();
    expect(row?.querySelector('[data-testid="thread-sidebar-toggle"]')).toBeTruthy();
    const brandRow = row?.querySelector(".flex.min-h-11");
    expect(brandRow?.contains(versionEl.element)).toBe(false);
  });
});
