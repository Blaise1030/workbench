import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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
  it("emits select when the title button is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await wrapper.get('[data-testid="thread-select"]').trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("applies active styling when isActive is true", () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: true } });
    expect(wrapper.get('[data-testid="thread-row"]').classes()).toContain("bg-accent");
  });

  it("applies green pulsing agent icon when needsAttention is true", () => {
    const wrapper = mount(ThreadRow, {
      props: { thread, isActive: false, needsAttention: true, runStatus: "failed" }
    });
    const icon = wrapper.getComponent({ name: "AgentIcon" });
    expect(icon.classes()).toEqual(
      expect.arrayContaining(["animate-pulse", "text-blue-600", "dark:text-blue-400"])
    );
  });

  it("keeps thread row at 36px and does not mount the menu trigger until the row is hovered", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes()).toContain("h-9");
    expect(wrapper.find('[data-testid="thread-menu-trigger"]').exists()).toBe(false);
    await hoverThreadRow(wrapper);
    expect(wrapper.find('[data-testid="thread-menu-trigger"]').exists()).toBe(true);
  });

  it("opens the action menu when the chevron button is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    expect(wrapper.find('[data-testid="thread-delete"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="thread-rename"]').exists()).toBe(true);
  });

  it("emits remove when Delete menu item is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-delete"]').trigger("click");
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });

  it("enters inline edit mode when Rename is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(true);
    expect((wrapper.get('[data-testid="thread-rename-input"]').element as HTMLInputElement).value).toBe(thread.title);
  });

  it("emits rename with new title on Enter", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("New Title");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["New Title"]]);
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("cancels rename on Escape without emitting", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename-input"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("does not emit rename when confirmed with empty value", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("   ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toBeUndefined();
  });
});
