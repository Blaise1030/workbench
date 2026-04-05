import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ThreadTopBar from "@/components/ThreadTopBar.vue";

describe("ThreadTopBar", () => {
  it("emits createWithAgent when an agent row is chosen", async () => {
    const wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");

    expect(wrapper.emitted("createWithAgent")).toEqual([["claude"]]);
  });

  it("emits createWithAgent with codex when Codex CLI row is clicked", async () => {
    const wrapper = mount(ThreadTopBar);

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    const items = wrapper.findAll('[role="menuitem"]');
    const codex = items.find((w) => w.text() === "Codex CLI");
    expect(codex).toBeDefined();
    await codex!.trigger("click");

    expect(wrapper.emitted("createWithAgent")).toEqual([["codex"]]);
  });

  it("shows app name for accessibility next to logo mark", () => {
    const wrapper = mount(ThreadTopBar);
    expect(wrapper.get('[data-testid="app-title-a11y"]').text()).toBe("Instrumental");
  });

  it("emits collapse when collapse control is used", async () => {
    const wrapper = mount(ThreadTopBar);
    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");
    expect(wrapper.emitted("collapse")).toEqual([[]]);
  });
});
