import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import type { Thread } from "@shared/domain";

async function hoverFirstThreadRow(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('[data-testid="thread-row"]').trigger("mouseenter");
}

describe("ThreadSidebar", () => {
  const threads: Thread[] = [
    {
      id: "t1",
      projectId: "p1",
      worktreeId: "w1",
      title: "Codex CLI · test",
      agent: "codex",
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    }
  ];

  it("emits createWithAgent when an agent row is chosen", async () => {
    const wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1"
      }
    });

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    await wrapper.get('[role="menuitem"]').trigger("click");

    expect(wrapper.emitted("createWithAgent")).toEqual([["claude"]]);
  });

  it("emits createWithAgent with codex when Codex CLI row is clicked", async () => {
    const wrapper = mount(ThreadSidebar, {
      props: {
        threads: [],
        activeThreadId: null
      }
    });

    await wrapper.get('[aria-label="New thread"]').trigger("click");
    const items = wrapper.findAll('[role="menuitem"]');
    const codex = items.find((w) => w.text() === "Codex CLI");
    expect(codex).toBeDefined();
    await codex!.trigger("click");

    expect(wrapper.emitted("createWithAgent")).toEqual([["codex"]]);
  });

  it("emits remove with threadId when a ThreadRow emits remove", async () => {
    const wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
    await hoverFirstThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-delete"]').trigger("click");
    expect(wrapper.emitted("remove")).toEqual([["t1"]]);
  });

  it("emits rename with threadId and new title when a ThreadRow emits rename", async () => {
    const wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
    await hoverFirstThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("Renamed");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["t1", "Renamed"]]);
  });
});
