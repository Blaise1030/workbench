import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import { isMacPlatform } from "@/keybindings/registry";

function modEnter(shift: boolean): KeyboardEvent {
  const mac = isMacPlatform();
  return new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
    metaKey: mac,
    ctrlKey: !mac,
    shiftKey: shift
  });
}

describe("ContextQueueSelectionPopup", () => {
  let wrapper: ReturnType<typeof mount<typeof ContextQueueSelectionPopup>>;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  it("emits queue when Queue is clicked", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    const queue = document.body.querySelector(
      '[data-testid="context-queue-selection-queue"]'
    ) as HTMLButtonElement;
    expect(queue).toBeTruthy();
    await queue.click();

    expect(wrapper.emitted("queue")).toHaveLength(1);
  });

  it("emits sendToAgent when Agent is clicked", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    const agent = document.body.querySelector(
      '[data-testid="context-queue-selection-agent"]'
    ) as HTMLButtonElement;
    expect(agent).toBeTruthy();
    await agent.click();

    expect(wrapper.emitted("sendToAgent")).toHaveLength(1);
  });

  it("emits dismiss when Escape is pressed", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(wrapper.emitted("dismiss")).toHaveLength(1);
  });

  it("emits queue when queue keybinding is pressed (Mod+Shift+Enter)", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    window.dispatchEvent(modEnter(true));

    expect(wrapper.emitted("queue")).toHaveLength(1);
  });

  it("emits sendToAgent when send keybinding is pressed (Mod+Enter)", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    window.dispatchEvent(modEnter(false));

    expect(wrapper.emitted("sendToAgent")).toHaveLength(1);
  });
});
