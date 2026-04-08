import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ThreadTopBar from "@/components/ThreadTopBar.vue";

describe("ThreadTopBar", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadTopBar>>;

  afterEach(() => {
    wrapper?.unmount();
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

  it("renders the active context label in collapsed mode", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true, contextLabel: "feature-a" } });

    expect(wrapper.get('[data-testid="thread-topbar-context-label"]').text()).toBe("feature-a");
  });

  it("does not render the add-thread control in the top bar", () => {
    wrapper = mount(ThreadTopBar);

    expect(wrapper.find('[aria-label="New thread"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Add thread"]').exists()).toBe(false);
  });
});
