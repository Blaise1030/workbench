import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";

function getThreadCreatePanel(): HTMLElement {
  return document.querySelector('[data-testid="thread-agent-menu-panel"]') as HTMLElement;
}

describe("ThreadCreateButton", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadCreateButton>>;

  afterEach(() => {
    wrapper?.unmount();
  });

  it("renders the menu as a portaled shadcn dropdown", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const panel = getThreadCreatePanel();
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("data-side")).toBeTruthy();
    expect(panel.className).toContain("w-[15rem]");
  });

  it("renders providers as a vertical list with icons at the start", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const items = Array.from(getThreadCreatePanel().querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    // First four menu items are agent picks; the following item is "New Thread Group" (emoji, not SVG).
    const agentItems = items.slice(0, 4);

    expect(agentItems).toHaveLength(4);
    for (const item of agentItems) {
      expect(item.className).toContain("justify-start");
      expect(item.className).toContain("gap-2");
      expect(item.querySelector("svg")).toBeTruthy();
    }
  });

  it("uses a flat popover shell and flat list rows while preserving hover styling", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const panel = getThreadCreatePanel();
    expect(panel.className).toContain("border");
    expect(panel.className).toContain("shadow-md");

    const items = Array.from(panel.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    for (const item of items) {
      expect(item.className).not.toContain("border");
      expect(item.className).not.toContain("shadow");
      expect(item.className).toContain("focus:bg-accent");
    }
  });
});
