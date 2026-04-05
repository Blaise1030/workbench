import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ThreadTopBar from "@/components/ThreadTopBar.vue";

function getAgentMenuPanel(): HTMLElement {
  const el = document.querySelector('[data-testid="thread-agent-menu-panel"]');
  if (!el) throw new Error("agent menu panel not in document (Teleport)");
  return el as HTMLElement;
}

describe("ThreadTopBar", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadTopBar>>;

  afterEach(() => {
    wrapper?.unmount();
  });

  it("emits createWithAgent when an agent row is chosen", async () => {
    wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    await nextTick();
    const first = getAgentMenuPanel().querySelector('[role="menuitem"]');
    expect(first).toBeTruthy();
    await first!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(wrapper.emitted("createWithAgent")).toEqual([["claude"]]);
  });

  it("emits createWithAgent with codex when Codex CLI row is clicked", async () => {
    wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    await nextTick();
    const items = getAgentMenuPanel().querySelectorAll('[role="menuitem"]');
    const codex = Array.from(items).find((el) => el.textContent?.includes("Codex CLI"));
    expect(codex).toBeDefined();
    await codex!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(wrapper.emitted("createWithAgent")).toEqual([["codex"]]);
  });

  it("shows product title and Alpha badge in header", () => {
    wrapper = mount(ThreadTopBar);
    const brand = wrapper.get('[data-testid="thread-sidebar-brand"]');
    expect(brand.text()).toContain("Instrumental");
    expect(brand.text().toUpperCase()).toContain("ALPHA");
  });

  it("emits collapse when collapse control is used", async () => {
    wrapper = mount(ThreadTopBar);
    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");
    expect(wrapper.emitted("collapse")).toEqual([[]]);
  });
});
