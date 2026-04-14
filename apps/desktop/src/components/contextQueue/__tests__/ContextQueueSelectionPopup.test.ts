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

function modL(): KeyboardEvent {
  const mac = isMacPlatform();
  return new KeyboardEvent("keydown", {
    key: "l",
    code: "KeyL",
    bubbles: true,
    cancelable: true,
    metaKey: mac,
    ctrlKey: !mac
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

  it("does not render Queue while selection-queue feature is disabled", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    expect(
      document.body.querySelector('[data-testid="context-queue-selection-queue"]')
    ).toBeNull();
  });

  it("emits sendToAgent when Add to Chat is clicked", async () => {
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

  it("does not dismiss when scroll fires inside a Monaco editor subtree", async () => {
    const monacoHost = document.createElement("div");
    monacoHost.className = "monaco-editor";
    const inner = document.createElement("div");
    monacoHost.appendChild(inner);
    document.body.appendChild(monacoHost);

    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    inner.dispatchEvent(new Event("scroll", { bubbles: false }));

    expect(wrapper.emitted("dismiss")).toBeUndefined();

    monacoHost.remove();
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

  it("does not emit queue when queue keybinding is pressed while selection-queue is disabled", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    window.dispatchEvent(modEnter(true));

    expect(wrapper.emitted("queue")).toBeUndefined();
  });

  it("emits sendToAgent when send keybinding is pressed (Mod+L)", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    window.dispatchEvent(modL());

    expect(wrapper.emitted("sendToAgent")).toHaveLength(1);
  });

  it("emits sendToAgent when send alias keybinding is pressed (Mod+Enter)", async () => {
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
