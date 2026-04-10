import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ThreadRow from "@/components/ThreadRow.vue";
import type { Thread } from "@shared/domain";

async function hoverThreadRow(wrapper: ReturnType<typeof mount>): Promise<void> {
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

describe("ThreadRow", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadRow>> | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  it("emits select when the title button is clicked", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    const selectButton = wrapper.get('[data-testid="thread-select"]');
    expect(selectButton.classes()).toContain("cursor-pointer");
    expect(selectButton.classes()).toContain("items-center");
    await selectButton.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("collapsed mode uses icon button with thread title as accessible name", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false, collapsed: true } });
    const btn = wrapper.get('[data-testid="thread-select"]');
    expect(btn.classes()).toContain("cursor-pointer");
    expect(btn.attributes("aria-label")).toBe(thread.title);
    expect(wrapper.find('[data-testid="thread-archive"]').exists()).toBe(false);
    await btn.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("uses the thread title as the collapsed row accessible label", async () => {
    wrapper = mount(ThreadRow, {
      attachTo: document.body,
      props: { thread, isActive: false, collapsed: true }
    });

    const button = wrapper.get('[data-testid="thread-select"]');
    expect(button.attributes("aria-label")).toContain(thread.title);
    expect(button.find("svg").exists()).toBe(true);
  });

  it("applies active styling when isActive is true", () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: true } });
    expect(wrapper.get('[data-testid="thread-row"]').classes()).toContain("bg-accent");
  });

  it("applies blue highlight when needsIdleAttention is true", () => {
    wrapper = mount(ThreadRow, {
      props: { thread, isActive: false, needsIdleAttention: true }
    });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes().some((c) => c.includes("blue-"))).toBe(true);
  });

  it("applies red agent icon when runStatus is failed", () => {
    wrapper = mount(ThreadRow, {
      props: { thread, isActive: false, runStatus: "failed" }
    });
    const icon = wrapper.getComponent({ name: "AgentIcon" });
    expect(icon.classes()).toEqual(expect.arrayContaining(["text-red-500"]));
  });

  it("keeps thread row at 32px and does not mount the archive trigger until the row is hovered", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes()).toContain("h-7");
    expect(wrapper.find('[data-testid="thread-archive"]').exists()).toBe(false);
    await hoverThreadRow(wrapper);
    expect(wrapper.find('[data-testid="thread-archive"]').exists()).toBe(true);
  });

  it("emits remove when the archive button is used and the window confirms", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-archive"]').trigger("click");
    expect(confirmSpy).toHaveBeenCalledWith(
      "Archive this thread? It will be removed from the sidebar."
    );
    expect(wrapper.emitted("remove")).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it("does not emit remove when the window confirm is dismissed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-archive"]').trigger("click");
    expect(wrapper.emitted("remove")).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it("enters inline edit mode when the row is double-clicked", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(true);
    expect((wrapper.get('[data-testid="thread-rename-input"]').element as HTMLInputElement).value).toBe(thread.title);
  });

  it("emits rename with new title on Enter after double-click edit", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("New Title");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["New Title"]]);
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("cancels rename on Escape without emitting", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    await wrapper.get('[data-testid="thread-rename-input"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("does not emit rename when confirmed with empty value", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("   ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toBeUndefined();
  });
});
