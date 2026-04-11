import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";

function getDialog(): HTMLElement {
  return document.querySelector('[data-testid="thread-create-dialog"]') as HTMLElement;
}

describe("ThreadCreateButton", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadCreateButton>>;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

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

    const promptHost = document.querySelector('[data-testid="thread-create-prompt-input"]');
    expect(promptHost).toBeTruthy();
    await flushPromises();
    const exposed = wrapper.vm as unknown as { threadPromptEditor?: Editor };
    expect(exposed.threadPromptEditor).toBeTruthy();
    exposed.threadPromptEditor!.commands.setContent("<p>Refactor auth</p>");
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

  it("inserts an image badge into the TipTap prompt when attaching an image via the file input", async () => {
    wrapper = mount(ThreadCreateButton, {
      attachTo: document.body,
      slots: { default: "Add thread" }
    });

    await wrapper.get('button[aria-label="New thread"]').trigger("click");
    await nextTick();
    await flushPromises();

    const dialog = getDialog();
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File([""], "Screenshot 2026-04-12.png", { type: "image/png" });
    const fileList = {
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
      0: file,
      *[Symbol.iterator]() {
        yield file;
      }
    } as FileList;
    Object.defineProperty(input, "files", { value: fileList, configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();

    const badge = dialog.querySelector("[data-thread-image-badge]");
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute("data-name")).toBe("Screenshot 2026-04-12.png");
    expect(dialog.querySelector('[data-testid="thread-create-files-strip"]')).toBeNull();
  });
});
