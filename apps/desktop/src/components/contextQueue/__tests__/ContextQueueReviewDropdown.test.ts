import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ContextQueueReviewDropdown from "@/components/contextQueue/ContextQueueReviewDropdown.vue";
import type { QueueItem } from "@/contextQueue/types";

function sampleItems(): QueueItem[] {
  return [
    {
      id: "1",
      source: "file",
      pasteText: "first",
      meta: {}
    },
    {
      id: "2",
      source: "diff",
      pasteText: "second",
      meta: {}
    }
  ];
}

describe("ContextQueueReviewDropdown", () => {
  let wrapper: ReturnType<typeof mount<typeof ContextQueueReviewDropdown>>;

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
  });

  it("emits confirm with edited paste text from textareas", async () => {
    wrapper = mount(ContextQueueReviewDropdown, {
      attachTo: document.body,
      props: {
        threadId: "t-1",
        items: sampleItems()
      }
    });

    await wrapper.get('[data-testid="workspace-context-queue-button"]').trigger("click");
    await flushPromises();

    const areas = document.body.querySelectorAll(
      '[data-testid="context-queue-review-paste"]'
    ) as NodeListOf<HTMLTextAreaElement>;
    expect(areas.length).toBe(2);
    areas[0]!.value = "edited first";
    areas[0]!.dispatchEvent(new Event("input"));

    await flushPromises();

    const confirm = document.body.querySelector(
      '[data-testid="context-queue-review-confirm"]'
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    await confirm.click();

    expect(wrapper.emitted("confirm")).toHaveLength(1);
    const payload = wrapper.emitted("confirm")![0]![0] as QueueItem[];
    expect(payload).toHaveLength(2);
    expect(payload[0]!.pasteText).toBe("edited first");
    expect(payload[1]!.pasteText).toBe("second");
  });

  it("disables Confirm when one textarea is cleared", async () => {
    wrapper = mount(ContextQueueReviewDropdown, {
      attachTo: document.body,
      props: {
        threadId: null,
        items: sampleItems()
      }
    });

    await wrapper.get('[data-testid="workspace-context-queue-button"]').trigger("click");
    await flushPromises();

    const areas = document.body.querySelectorAll(
      '[data-testid="context-queue-review-paste"]'
    ) as NodeListOf<HTMLTextAreaElement>;
    areas[0]!.value = "";
    areas[0]!.dispatchEvent(new Event("input"));

    await flushPromises();

    const confirm = document.body.querySelector(
      '[data-testid="context-queue-review-confirm"]'
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
