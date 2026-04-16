import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("renders the four agent buttons", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-agent-claude"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="inline-prompt-agent-cursor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="inline-prompt-agent-codex"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="inline-prompt-agent-gemini"]').exists()).toBe(true);
  });

  it("emits submit with payload when an agent button is clicked", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await nextTick();
    await wrapper.find('[data-testid="inline-prompt-agent-codex"]').trigger("click");
    await nextTick();
    const emitted = wrapper.emitted("submit");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ agent: "codex", prompt: "" });
  });

  it("emits submit with preferred agent when the exposed submit is called", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await nextTick();

    const vm = wrapper.vm as unknown as { submit: () => void };
    vm.submit();
    await nextTick();

    const emitted = wrapper.emitted("submit");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ agent: "claude" });
  });

  it("emits cancel when Escape is pressed", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();

    expect(wrapper.emitted("cancel")).toBeTruthy();
  });
});
