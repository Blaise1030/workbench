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
    expect(wrapper.find('[data-testid="inline-prompt-tiptap-placeholder-hint"]').exists()).toBe(true);
  });

  it("shows thread context label when provided", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: {
        worktreeId: "wt-1",
        worktreePath: null,
        threadContextLabel: "feature/foo · my-worktree"
      }
    });
    expect(wrapper.text()).toContain("feature/foo · my-worktree");
  });

  it("renders start and cancel controls", () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    expect(wrapper.find('[data-testid="inline-prompt-cancel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="inline-prompt-start-thread"]').exists()).toBe(true);
  });

  it("emits submit payload when start thread is clicked", async () => {
    wrapper = mount(ThreadInlinePromptEditor, {
      attachTo: document.body,
      props: { worktreeId: "wt-1", worktreePath: null }
    });
    await nextTick();
    await wrapper.find('[data-testid="inline-prompt-start-thread"]').trigger("click");
    await nextTick();
    const emitted = wrapper.emitted("submit");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ agent: "claude" });
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
