import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";

describe("ContextQueueSelectionPopup", () => {
  let wrapper: ReturnType<typeof mount<typeof ContextQueueSelectionPopup>>;

  afterEach(() => {
    wrapper?.unmount();
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

  it("emits dismiss when dismiss is clicked", async () => {
    wrapper = mount(ContextQueueSelectionPopup, {
      attachTo: document.body,
      props: {
        visible: true,
        anchor: { left: 10, top: 10, width: 1, height: 1 }
      }
    });

    await wrapper.vm.$nextTick();
    const dismiss = document.body.querySelector(
      '[data-testid="context-queue-selection-dismiss"]'
    ) as HTMLButtonElement;
    expect(dismiss).toBeTruthy();
    await dismiss.click();

    expect(wrapper.emitted("dismiss")).toHaveLength(1);
  });
});
