import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import ThreadRow from "@/components/ThreadRow.vue";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RunStatus, Thread } from "@shared/domain";

async function hoverThreadRow(wrapper: ReturnType<typeof mountThreadRow>): Promise<void> {
  await wrapper.get('[data-testid="thread-row"]').trigger("mouseenter");
}

const thread: Thread = {
  id: "t1",
  projectId: "p1",
  worktreeId: "w1",
  title: "Claude Code · Apr 5",
  agent: "claude",
  createdAt: "2026-04-05T00:00:00.000Z",
  updatedAt: "2026-04-05T00:00:00.000Z"
};

type ThreadRowMountProps = {
  thread: Thread;
  isActive: boolean;
  collapsed?: boolean;
  runStatus?: RunStatus | null;
  needsIdleAttention?: boolean;
  hideAgentIcon?: boolean;
};

/** Production mounts one `TooltipProvider` in `App.vue`; isolated tests mirror that here. */
function mountThreadRow(
  rowProps: ThreadRowMountProps,
  options?: { attachTo?: HTMLElement }
) {
  const Host = defineComponent({
    name: "ThreadRowWithTooltipProvider",
    setup() {
      return () =>
        h(TooltipProvider, null, {
          default: () => h(ThreadRow, rowProps)
        });
    }
  });
  return mount(Host, options);
}

function rowEmitted(wrapper: ReturnType<typeof mountThreadRow>, event: string) {
  return wrapper.findComponent(ThreadRow).emitted(event);
}

describe("ThreadRow", () => {
  let wrapper: ReturnType<typeof mountThreadRow> | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  it("emits select when the title button is clicked", async () => {
    wrapper = mountThreadRow({ thread, isActive: false });
    const selectButton = wrapper.get('[data-testid="thread-select"]');
    expect(selectButton.classes()).toContain("cursor-pointer");
    expect(selectButton.classes()).toContain("items-center");
    await selectButton.trigger("click");
    expect(rowEmitted(wrapper, "select")).toHaveLength(1);
  });

  it("uses the thread title as the collapsed row accessible label", async () => {
    wrapper = mountThreadRow({ thread, isActive: false, collapsed: true }, { attachTo: document.body });

    const button = wrapper.get('[data-testid="thread-select"]');
    expect(button.attributes("aria-label")).toContain(thread.title);
    expect(wrapper.findComponent({ name: "AgentIcon" }).exists()).toBe(true);
  });

  it("omits AgentIcon while hideAgentIcon is true (expanded and collapsed)", () => {
    wrapper = mountThreadRow({ thread, isActive: true, hideAgentIcon: true });
    expect(wrapper.findComponent({ name: "AgentIcon" }).exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="thread-agent-icon-pending"]')).toHaveLength(1);

    wrapper.unmount();
    wrapper = mountThreadRow({ thread, isActive: false, collapsed: true, hideAgentIcon: true });
    expect(wrapper.findComponent({ name: "AgentIcon" }).exists()).toBe(false);
    expect(wrapper.get('[data-testid="thread-agent-icon-pending"]').exists()).toBe(true);
  });

  it("applies active styling when isActive is true", () => {
    wrapper = mountThreadRow({ thread, isActive: true });
    expect(wrapper.get('[data-testid="thread-row"]').classes()).toContain("bg-accent");
  });

  it("applies blue highlight when needsIdleAttention is true", () => {
    wrapper = mountThreadRow({
      thread,
      isActive: false,
      needsIdleAttention: true
    });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes().some((c) => c.includes("blue-"))).toBe(true);
  });

  it("applies red agent icon when runStatus is failed", () => {
    wrapper = mountThreadRow({
      thread,
      isActive: false,
      runStatus: "failed"
    });
    const icon = wrapper.getComponent({ name: "AgentIcon" });
    expect(icon.classes()).toEqual(expect.arrayContaining(["text-red-500"]));
  });

  it("keeps thread row at 32px and does not mount the archive trigger until the row is hovered", async () => {
    wrapper = mountThreadRow({ thread, isActive: false });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes()).toContain("h-7");
    expect(wrapper.find('[data-testid="thread-archive"]').exists()).toBe(false);
    await hoverThreadRow(wrapper);
    expect(wrapper.find('[data-testid="thread-archive"]').exists()).toBe(true);
  });

  it("emits remove when the archive button is used and the window confirms", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    wrapper = mountThreadRow({ thread, isActive: false }, { attachTo: document.body });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-archive"]').trigger("click");
    expect(confirmSpy).toHaveBeenCalledWith(
      "Archive this thread? It will be removed from the sidebar."
    );
    expect(rowEmitted(wrapper, "remove")).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it("does not emit remove when the window confirm is dismissed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    wrapper = mountThreadRow({ thread, isActive: false }, { attachTo: document.body });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-archive"]').trigger("click");
    expect(rowEmitted(wrapper, "remove")).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it("enters inline edit mode when the row is double-clicked", async () => {
    wrapper = mountThreadRow({ thread, isActive: false });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="thread-rename-input"]').text()).toBe(thread.title);
  });

  it("emits rename with new title on Enter after double-click edit", async () => {
    wrapper = mountThreadRow({ thread, isActive: false });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    (input.element as HTMLElement).textContent = "New Title";
    await input.trigger("input");
    await input.trigger("keydown", { key: "Enter" });
    expect(rowEmitted(wrapper, "rename")).toEqual([["New Title"]]);
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("cancels rename on Escape without emitting", async () => {
    wrapper = mountThreadRow({ thread, isActive: false });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    await wrapper.get('[data-testid="thread-rename-input"]').trigger("keydown", { key: "Escape" });
    expect(rowEmitted(wrapper, "rename")).toBeUndefined();
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("does not emit rename when confirmed with empty value", async () => {
    const w = mountThreadRow({ thread, isActive: false });
    await w.get('[data-testid="thread-select"]').trigger("dblclick");
    const input = w.get('[data-testid="thread-rename-input"]');
    (input.element as HTMLElement).textContent = "   ";
    await input.trigger("input");
    await input.trigger("keydown", { key: "Enter" });
    expect(rowEmitted(w, "rename")).toBeUndefined();
    w.unmount();
  });
});
