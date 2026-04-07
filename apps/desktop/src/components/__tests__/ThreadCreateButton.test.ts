import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";

describe("ThreadCreateButton", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadCreateButton>>;

  afterEach(() => {
    wrapper?.unmount();
  });

  it("positions the popup above the trigger", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    const triggerWrap = wrapper.get("div").element as HTMLElement;
    triggerWrap.getBoundingClientRect = () =>
      ({
        top: 120,
        bottom: 148,
        left: 80,
        width: 40,
        height: 28,
        right: 120,
        x: 80,
        y: 120,
        toJSON: () => ({})
      }) as DOMRect;

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const panel = document.querySelector('[data-testid="thread-agent-menu-panel"]') as HTMLElement;
    expect(panel.style.top).toBe("116px");
    expect(panel.style.left).toBe("80px");
    expect(panel.style.transform).toBe("translateY(-100%)");
  });

  it("keeps the popup at least 200px wide", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    const triggerWrap = wrapper.get("div").element as HTMLElement;
    triggerWrap.getBoundingClientRect = () =>
      ({
        top: 120,
        bottom: 148,
        left: 80,
        width: 40,
        height: 28,
        right: 120,
        x: 80,
        y: 120,
        toJSON: () => ({})
      }) as DOMRect;
    const narrowAside = document.createElement("aside");
    narrowAside.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 400,
        left: 0,
        width: 120,
        height: 400,
        right: 120,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect;
    triggerWrap.closest = ((selector: string) => (selector === "aside" ? narrowAside : null)) as
      typeof triggerWrap.closest;

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const panel = document.querySelector('[data-testid="thread-agent-menu-panel"]') as HTMLElement;
    expect(panel.style.width).toBe("200px");
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

    const items = Array.from(
      document.querySelectorAll('[data-testid="thread-agent-menu-panel"] [role="menuitem"]')
    ) as HTMLElement[];
    // First four menu items are agent picks; the following item is "New Thread Group" (emoji, not SVG).
    const agentItems = items.slice(0, 4);

    expect(agentItems).toHaveLength(4);
    for (const item of agentItems) {
      expect(item.className).toContain("w-full");
      expect(item.className).toContain("justify-start");
      expect(item.className).not.toContain("aspect-square");
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

    const panel = document.querySelector('[data-testid="thread-agent-menu-panel"]') as HTMLElement;
    expect(panel.className).toContain("border");
    expect(panel.className).toContain("shadow-md");

    const items = Array.from(panel.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    for (const item of items) {
      expect(item.className).not.toContain("border");
      expect(item.className).not.toContain("shadow");
      expect(item.className).toContain("hover:bg-accent");
    }
  });
});
