import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";

function getDialog(): HTMLElement {
  return document.querySelector('[data-testid="thread-create-dialog"]') as HTMLElement;
}

describe("ThreadCreateButton", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadCreateButton>>;

  afterEach(() => {
    wrapper?.unmount();
  });

  it("opens a dialog with a prompt field when the trigger is clicked", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const dialog = getDialog();
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector('[data-testid="thread-create-prompt-input"]')).toBeTruthy();
  });

  it("emits createWithAgent with prompt when Start thread is clicked", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: {
        default: "Add thread"
      }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const promptEl = document.querySelector(
      '[data-testid="thread-create-prompt-input"]'
    ) as HTMLTextAreaElement;
    expect(promptEl).toBeTruthy();
    promptEl.value = "Refactor auth";
    await promptEl.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();

    const dialog = getDialog();
    const start = dialog.querySelector('[aria-label="Start thread"]') as HTMLButtonElement;
    expect(start).toBeTruthy();
    await start.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted("createWithAgent")).toEqual([
      [{ agent: "claude", prompt: "Refactor auth", threadTitle: "Refactor auth" }]
    ]);
  });

  it("shows attach files control", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: { default: "Add thread" }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();

    const dialog = getDialog();
    expect(dialog.querySelector('[data-testid="thread-create-add-file"]')).toBeTruthy();
  });
});
