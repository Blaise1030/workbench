import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ThreadRow from "@/components/ThreadRow.vue";
import type { Thread } from "@shared/domain";

async function hoverThreadRow(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('[data-testid="thread-row"]').trigger("mouseenter");
}

function getThreadMenuItem(testId: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${testId}"]`);
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
    expect(wrapper.find('[data-testid="thread-menu-trigger"]').exists()).toBe(false);
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

  it("keeps thread row at 32px and does not mount the menu trigger until the row is hovered", async () => {
    wrapper = mount(ThreadRow, { props: { thread, isActive: false } });
    const row = wrapper.get('[data-testid="thread-row"]');
    expect(row.classes()).toContain("h-7");
    expect(wrapper.find('[data-testid="thread-menu-trigger"]').exists()).toBe(false);
    await hoverThreadRow(wrapper);
    expect(wrapper.find('[data-testid="thread-menu-trigger"]').exists()).toBe(true);
  });

  it("opens the action menu when the chevron button is clicked", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();
    expect(getThreadMenuItem("thread-delete")).not.toBeNull();
    expect(getThreadMenuItem("thread-rename")).not.toBeNull();
  });

  it("renders a flat action menu without border or shadow", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();

    const menu = document.querySelector('[data-slot="dropdown-menu-content"]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.className).toContain("border");
    expect(menu.className).toContain("shadow-md");
    expect(menu.className).toContain("bg-popover");
  });

  it("uses list-style action rows with hover background and destructive delete text", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();

    const rename = getThreadMenuItem("thread-rename") as HTMLElement;
    const deleteButton = getThreadMenuItem("thread-delete") as HTMLElement;

    expect(rename.className).toContain("focus:bg-accent");
    expect(rename.className).not.toContain("border");
    expect(deleteButton.dataset.variant).toBe("destructive");
    expect(deleteButton.className).toContain("text-destructive");
    expect(deleteButton.className).toContain("focus:bg-destructive/10");
    expect(deleteButton.className).not.toContain("border");
  });

  it("emits remove when Delete menu item is clicked", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();
    getThreadMenuItem("thread-delete")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });

  it("enters inline edit mode when Rename is clicked", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();
    getThreadMenuItem("thread-rename")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(true);
    expect((wrapper.get('[data-testid="thread-rename-input"]').element as HTMLInputElement).value).toBe(thread.title);
  });

  it("emits rename with new title on Enter", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();
    getThreadMenuItem("thread-rename")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("New Title");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["New Title"]]);
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("cancels rename on Escape without emitting", async () => {
    wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();
    getThreadMenuItem("thread-rename")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    await wrapper.get('[data-testid="thread-rename-input"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("rename")).toBeUndefined();
    expect(wrapper.find('[data-testid="thread-rename-input"]').exists()).toBe(false);
  });

  it("does not emit rename when confirmed with empty value", async () => {
    const wrapper = mount(ThreadRow, { attachTo: document.body, props: { thread, isActive: false } });
    await hoverThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await nextTick();
    getThreadMenuItem("thread-rename")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("   ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toBeUndefined();
  });
});
