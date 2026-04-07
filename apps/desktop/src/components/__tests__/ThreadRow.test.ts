import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
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
  sortOrder: 0,
  createdAt: "2026-04-05T00:00:00.000Z",
  updatedAt: "2026-04-05T00:00:00.000Z"
};

describe("ThreadRow", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("emits select when the title button is clicked", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    const selectButton = wrapper.get('[data-testid="thread-select"]');
    expect(selectButton.classes()).toContain("cursor-pointer");
    await selectButton.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("collapsed mode uses icon button with thread title as accessible name", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false, collapsed: true } });
    const btn = wrapper.get('[data-testid="thread-select"]');
    expect(btn.classes()).toContain("cursor-pointer");
    expect(btn.attributes("aria-label")).toBe(thread.title);
    expect(wrapper.find('[data-testid="thread-menu-trigger"]').exists()).toBe(false);
    await btn.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });

  it("shows a tooltip for collapsed rows on hover", async () => {
    const wrapper = mount(ThreadRow, {
      attachTo: document.body,
      props: { thread, isActive: false, collapsed: true }
    });

    expect(document.querySelector('[data-testid="thread-collapsed-tooltip"]')).toBeNull();

    await hoverThreadRow(wrapper);
    await nextTick();

    expect(document.querySelector('[data-testid="thread-collapsed-tooltip"]')?.textContent).toBe(thread.title);
  });

  it("links the collapsed row button to its tooltip while visible", async () => {
    const wrapper = mount(ThreadRow, {
      attachTo: document.body,
      props: { thread, isActive: false, collapsed: true }
    });

    await hoverThreadRow(wrapper);
    await nextTick();

    const button = wrapper.get('[data-testid="thread-select"]');
    const tooltip = document.querySelector('[data-testid="thread-collapsed-tooltip"]');

    expect(tooltip).not.toBeNull();
    expect(button.attributes("aria-describedby")).toBe(tooltip?.getAttribute("id") ?? undefined);
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

  it("keeps thread row at 32px and does not mount the menu trigger until the row is hovered", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes()).toContain("h-7");
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

  it("renders a flat action menu without border or shadow", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");

    const menu = wrapper.get('[role="menu"]');
    expect(menu.classes()).not.toContain("border");
    expect(menu.classes()).not.toContain("shadow-md");
    expect(menu.classes()).toContain("bg-popover");
  });

  it("uses list-style action rows with hover background and destructive delete text", async () => {
    const wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");

    const rename = wrapper.get('[data-testid="thread-rename"]');
    const deleteButton = wrapper.get('[data-testid="thread-delete"]');

    expect(rename.classes()).toContain("hover:bg-accent");
    expect(rename.classes()).not.toContain("border");
    expect(deleteButton.classes()).toContain("text-destructive");
    expect(deleteButton.classes()).toContain("hover:bg-accent");
    expect(deleteButton.classes()).not.toContain("border");
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
