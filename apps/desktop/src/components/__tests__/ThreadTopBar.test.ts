import { mount } from "@vue/test-utils";
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

  it("renders only the collapse control in the header (no brand strip)", () => {
    wrapper = mount(ThreadTopBar, { props: { contextLabel: "Primary" } });
    expect(wrapper.find('[data-testid="thread-sidebar-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="thread-sidebar-brand"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="thread-topbar-brand-badge"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="thread-sidebar-alpha-badge"]').exists()).toBe(false);
  });

  it("renders the collapse toggle beside the title when expanded", async () => {
    wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");

    expect(wrapper.emitted("collapse")).toEqual([[]]);
  });

  it("uses the collapse control when collapsed prop is true (no expand-only control)", async () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true } });

    expect(wrapper.find('[aria-label="Expand threads sidebar"]').exists()).toBe(false);
    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");

    expect(wrapper.emitted("collapse")).toEqual([[]]);
    expect(wrapper.emitted("expand")).toBeUndefined();
  });

  it("does not render a sidebar logo mark", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true } });
    expect(wrapper.find('[data-testid="thread-sidebar-logo"]').exists()).toBe(false);
  });

  it("does not surface context label in the top bar DOM", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true, contextLabel: "feature-a" } });

    expect(wrapper.find('[data-testid="thread-topbar-context-label"]').exists()).toBe(false);
    expect(wrapper.find(".sr-only").exists()).toBe(false);
  });

  it("does not render the add-thread control in the top bar", () => {
    wrapper = mount(ThreadTopBar);

    expect(wrapper.find('[aria-label="New thread"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Add thread"]').exists()).toBe(false);
  });
});
