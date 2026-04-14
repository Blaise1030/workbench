import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThreadInlinePromptEditor from "@/components/ThreadInlinePromptEditor.vue";

describe("ThreadInlinePromptEditor", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadInlinePromptEditor>>;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  it("renders the prompt editor area", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-editor"]').exists()).toBe(true);
  });

  it("renders the agent selector", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-agent-select"]').exists()).toBe(true);
  });

  it("renders the attach files button", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-add-file"]').exists()).toBe(true);
  });

  it("emits cancel when the cancel button is clicked", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await wrapper.find('[data-testid="inline-prompt-cancel"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
  });

  it("emits submit with payload when start-thread button is clicked", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await nextTick();
    // Trigger submit via the exposed method (simulates Enter or button click)
    const vm = wrapper.vm as unknown as { submit: () => void };
    vm.submit();
    await nextTick();
    const emitted = wrapper.emitted("submit");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ agent: "claude" });
  });
});
