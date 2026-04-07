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
    const items = getAgentMenuPanel().querySelectorAll('[role="menuitem"]');
    const claude = Array.from(items).find((el) => el.textContent?.includes("Claude Code"));
    expect(claude).toBeTruthy();
    await claude!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

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

  it("renders agent picker items as bordered tiles with subtle shadows", async () => {
    wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    await nextTick();
    const items = getAgentMenuPanel().querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(5);
    // First row is "New Thread Group"; next four are agent tiles with border and shadow styling
    for (let i = 1; i < 5; i++) {
      expect(items[i]!.className).toContain("border");
      expect(items[i]!.className).toContain("shadow-");
    }
  });

  it("shows product title and Alpha badge in header", () => {
    wrapper = mount(ThreadTopBar);
    const brand = wrapper.get('[data-testid="thread-sidebar-brand"]');
    expect(brand.text()).toContain("workbench");
    expect(brand.text().toUpperCase()).toContain("ALPHA");
  });

  it("does not show new thread control when collapsed", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true } });
    expect(wrapper.find('[aria-label="New thread"]').exists()).toBe(false);
  });

  it("renders a slightly larger logo when collapsed", () => {
    wrapper = mount(ThreadTopBar, { props: { collapsed: true } });
    expect(wrapper.get('[data-testid="thread-sidebar-logo"]').classes()).toContain("size-8");
  });
});
