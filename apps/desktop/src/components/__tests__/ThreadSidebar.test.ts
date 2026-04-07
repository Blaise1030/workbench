import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import type { Thread, Worktree } from "@shared/domain";

async function hoverFirstThreadRow(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('[data-testid="thread-row"]').trigger("mouseenter");
}

function createDragData(): {
  dropEffect: string;
  effectAllowed: string;
  setData: (format: string, value: string) => void;
  getData: (format: string) => string;
} {
  const values = new Map<string, string>();

  return {
    dropEffect: "move",
    effectAllowed: "move",
    setData(format: string, value: string) {
      values.set(format, value);
    },
    getData(format: string) {
      return values.get(format) ?? "";
    }
  };
}

describe("ThreadSidebar", () => {
  let wrapper: ReturnType<typeof mount<typeof ThreadSidebar>>;

  afterEach(() => {
    wrapper?.unmount();
  });

  const threads: Thread[] = [
    {
      id: "t1",
      projectId: "p1",
      worktreeId: "w1",
      title: "Codex CLI · test",
      agent: "codex",
      sortOrder: 0,
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    }
  ];

  const reorderedThreads: Thread[] = [
    threads[0],
    {
      id: "t2",
      projectId: "p1",
      worktreeId: "w1",
      title: "Claude Code · docs",
      agent: "claude",
      sortOrder: 1,
      createdAt: "2026-04-05T00:01:00.000Z",
      updatedAt: "2026-04-05T00:01:00.000Z"
    },
    {
      id: "t3",
      projectId: "p1",
      worktreeId: "w1",
      title: "Gemini CLI · review",
      agent: "gemini",
      sortOrder: 2,
      createdAt: "2026-04-05T00:02:00.000Z",
      updatedAt: "2026-04-05T00:02:00.000Z"
    }
  ];

  it("shows icon-only thread rows when collapsed", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1",
        collapsed: true
      }
    });

    expect(wrapper.attributes("data-thread-sidebar-collapsed")).toBe("true");
    expect(wrapper.findAll('[data-testid="thread-select"]').map((n) => n.text())).toEqual([
      "",
      "",
      ""
    ]);
    expect(wrapper.findAll('[data-testid="thread-drag-handle"]')).toHaveLength(0);
  });

  it("renders the expand toggle in the top bar when collapsed", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1",
        collapsed: true
      }
    });

    await wrapper.get('[aria-label="Expand threads sidebar"]').trigger("click");

    expect(wrapper.emitted("expand")).toEqual([[]]);
  });

  it("renders the collapse toggle in the top bar when expanded", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");

    expect(wrapper.emitted("collapse")).toEqual([[]]);
  });

  it("shows a simple top-aligned no-threads label when empty", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [],
        activeThreadId: null
      }
    });

    expect(wrapper.text()).toContain("No threads");
    expect(wrapper.text()).not.toContain("No threads yet");
    expect(wrapper.find('[aria-label="Add thread"]').exists()).toBe(true);
  });

  it("renders a labeled add-thread button in the footer when expanded", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1"
      }
    });

    expect(wrapper.get('[aria-label="Add thread"]').text()).toContain("Add thread");
  });

  it("renders an icon-only add-thread button in the footer when collapsed", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        collapsed: true
      }
    });

    expect(wrapper.get('[aria-label="Add thread"]').text()).toBe("");
  });

  it("emits createWithAgent when an agent row is chosen from the footer button", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1"
      }
    });

    await wrapper.get('[aria-label="Add thread"]').trigger("click");
    await nextTick();
    const panel = document.querySelector('[data-testid="thread-agent-menu-panel"]');
    expect(panel).toBeTruthy();
    const items = panel!.querySelectorAll('[role="menuitem"]');
    const claude = Array.from(items).find((el) => el.textContent?.includes("Claude Code"));
    expect(claude).toBeTruthy();
    await claude!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(wrapper.emitted("createWithAgent")).toEqual([["claude"]]);
  });

  it("emits remove with threadId when a ThreadRow emits remove", async () => {
    wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
    await hoverFirstThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-delete"]').trigger("click");
    expect(wrapper.emitted("remove")).toEqual([["t1"]]);
  });

  it("emits rename with threadId and new title when a ThreadRow emits rename", async () => {
    wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
    await hoverFirstThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-menu-trigger"]').trigger("click");
    await wrapper.get('[data-testid="thread-rename"]').trigger("click");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("Renamed");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["t1", "Renamed"]]);
  });

  it("preserves the provided thread order on initial render", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Codex CLI · test",
      "Claude Code · docs",
      "Gemini CLI · review"
    ]);
  });

  it("renders a local reordered list during drag interaction", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    const dragRows = wrapper.findAll('[data-testid="thread-row"]');
    const dragHandles = wrapper.findAll('[data-testid="thread-drag-handle"]');
    const dataTransfer = createDragData();

    expect(dragHandles).toHaveLength(3);
    expect(dragRows[0]!.attributes("draggable")).toBeUndefined();
    expect(dragHandles[0]!.attributes("draggable")).toBe("true");
    expect(dragHandles[0]!.classes()).toContain("absolute");
    expect(dragHandles[0]!.classes()).toContain("right-6");
    expect(dragRows[0]!.classes()).not.toContain("pl-9");
    expect(dragHandles[0]!.classes()).toContain("opacity-0");
    expect(dragHandles[0]!.classes()).toContain("pointer-events-none");

    await dragRows[0]!.trigger("mouseenter");

    expect(dragHandles[0]!.classes()).toContain("opacity-100");
    expect(dragHandles[0]!.classes()).not.toContain("pointer-events-none");

    await dragHandles[0]!.trigger("dragstart", { dataTransfer });
    await dragRows[2]!.trigger("dragenter", { dataTransfer });

    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Claude Code · docs",
      "Gemini CLI · review",
      "Codex CLI · test"
    ]);
  });

  it("reorders from the drag handle with keyboard controls", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    const dragHandles = wrapper.findAll('[data-testid="thread-drag-handle"]');

    await dragHandles[1]!.trigger("keydown", { key: "ArrowDown" });

    expect(wrapper.emitted("reorder")).toEqual([[["t1", "t3", "t2"]]]);
    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Codex CLI · test",
      "Gemini CLI · review",
      "Claude Code · docs"
    ]);
  });

  it("emits reorder with the final visible ids on drop", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    const dragRows = wrapper.findAll('[data-testid="thread-row"]');
    const dragHandles = wrapper.findAll('[data-testid="thread-drag-handle"]');
    const dataTransfer = createDragData();

    await dragHandles[0]!.trigger("dragstart", { dataTransfer });
    await dragRows[2]!.trigger("dragenter", { dataTransfer });
    await dragRows[2]!.trigger("drop", { dataTransfer });
    await dragHandles[0]!.trigger("dragend", { dataTransfer });

    expect(wrapper.emitted("reorder")).toEqual([[["t2", "t3", "t1"]]]);
    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Claude Code · docs",
      "Gemini CLI · review",
      "Codex CLI · test"
    ]);
  });

  it("reorders on drop even if dragenter did not fire for the final target", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    const dragRows = wrapper.findAll('[data-testid="thread-row"]');
    const dragHandles = wrapper.findAll('[data-testid="thread-drag-handle"]');
    const dataTransfer = createDragData();

    await dragHandles[0]!.trigger("dragstart", { dataTransfer });
    await dragRows[2]!.trigger("drop", { dataTransfer });
    await dragHandles[0]!.trigger("dragend", { dataTransfer });

    expect(wrapper.emitted("reorder")).toEqual([[["t2", "t3", "t1"]]]);
    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Claude Code · docs",
      "Gemini CLI · review",
      "Codex CLI · test"
    ]);
  });

  it("does not emit reorder for a no-op drag and drop", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    const dragRows = wrapper.findAll('[data-testid="thread-row"]');
    const dragHandles = wrapper.findAll('[data-testid="thread-drag-handle"]');
    const dataTransfer = createDragData();

    await dragHandles[1]!.trigger("dragstart", { dataTransfer });
    await dragRows[1]!.trigger("dragenter", { dataTransfer });
    await dragRows[1]!.trigger("drop", { dataTransfer });
    await dragHandles[1]!.trigger("dragend", { dataTransfer });

    expect(wrapper.emitted("reorder")).toBeUndefined();
  });

  it("renders threads grouped by worktree with group headers", () => {
    const ungroupedThreads: Thread[] = [
      {
        id: "t1",
        projectId: "p1",
        worktreeId: "w-default",
        title: "Ungrouped thread",
        agent: "claude",
        sortOrder: 0,
        createdAt: "2026-04-07T00:00:00Z",
        updatedAt: "2026-04-07T00:00:00Z"
      }
    ];
    const groupedThreads: Thread[] = [
      {
        id: "t2",
        projectId: "p1",
        worktreeId: "w-feat",
        title: "Grouped thread",
        agent: "codex",
        sortOrder: 0,
        createdAt: "2026-04-07T00:01:00Z",
        updatedAt: "2026-04-07T00:01:00Z"
      }
    ];

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [...ungroupedThreads, ...groupedThreads],
        activeThreadId: "t1",
        threadGroups: [
          {
            id: "w-feat",
            projectId: "p1",
            name: "feat/auth",
            branch: "feat/auth",
            path: "/tmp/.worktrees/feat-auth",
            isActive: true,
            isDefault: false,
            baseBranch: "main",
            lastActiveThreadId: null,
            createdAt: "2026-04-07T00:00:00Z",
            updatedAt: "2026-04-07T00:00:00Z"
          }
        ],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.find('[data-testid="thread-group-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="thread-group-header"]').text()).toContain("feat/auth");
    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(2);
  });

  it("hides stale worktree callouts when the sidebar is collapsed", () => {
    const worktree: Worktree = {
      id: "w-feat",
      projectId: "p1",
      name: "feat/auth",
      branch: "feat/auth",
      path: "/tmp/.worktrees/feat-auth",
      isActive: true,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [
          {
            id: "t2",
            projectId: "p1",
            worktreeId: "w-feat",
            title: "Grouped thread",
            agent: "codex",
            sortOrder: 0,
            createdAt: "2026-04-07T00:01:00Z",
            updatedAt: "2026-04-07T00:01:00Z"
          }
        ],
        activeThreadId: "t2",
        collapsed: true,
        threadGroups: [worktree],
        defaultWorktreeId: "w-default",
        staleWorktreeIds: new Set(["w-feat"])
      }
    });

    expect(wrapper.findComponent({ name: "WorktreeStaleCallout" }).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Delete group & threads");
  });

  it("hides stale worktree callouts when the group is collapsed", async () => {
    const worktree: Worktree = {
      id: "w-feat",
      projectId: "p1",
      name: "feat/auth",
      branch: "feat/auth",
      path: "/tmp/.worktrees/feat-auth",
      isActive: true,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [
          {
            id: "t2",
            projectId: "p1",
            worktreeId: "w-feat",
            title: "Grouped thread",
            agent: "codex",
            sortOrder: 0,
            createdAt: "2026-04-07T00:01:00Z",
            updatedAt: "2026-04-07T00:01:00Z"
          }
        ],
        activeThreadId: "t2",
        threadGroups: [worktree],
        defaultWorktreeId: "w-default",
        staleWorktreeIds: new Set(["w-feat"])
      }
    });

    expect(wrapper.text()).toContain("Delete group & threads");

    await wrapper.get('[data-testid="thread-group-header"]').trigger("click");

    expect(wrapper.findComponent({ name: "WorktreeStaleCallout" }).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Delete group & threads");
  });

  it("shows a tooltip for collapsed worktree groups on hover", async () => {
    const worktree: Worktree = {
      id: "w-feat",
      projectId: "p1",
      name: "feat/auth",
      branch: "feat/auth",
      path: "/tmp/.worktrees/feat-auth",
      isActive: true,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [
          {
            id: "t2",
            projectId: "p1",
            worktreeId: "w-feat",
            title: "Grouped thread",
            agent: "codex",
            sortOrder: 0,
            createdAt: "2026-04-07T00:01:00Z",
            updatedAt: "2026-04-07T00:01:00Z"
          }
        ],
        activeThreadId: "t2",
        collapsed: true,
        threadGroups: [worktree],
        defaultWorktreeId: "w-default"
      },
      attachTo: document.body
    });

    expect(document.querySelector('[data-testid="thread-group-collapsed-tooltip"]')).toBeNull();

    await wrapper.get('[data-testid="thread-group-collapsed-trigger"]').trigger("mouseenter");

    expect(
      document.querySelector('[data-testid="thread-group-collapsed-tooltip"]')?.textContent
    ).toContain("feat/auth");
  });

  it("opens a popover thread list for collapsed worktree groups on click", async () => {
    const worktree: Worktree = {
      id: "w-feat",
      projectId: "p1",
      name: "feat/auth",
      branch: "feat/auth",
      path: "/tmp/.worktrees/feat-auth",
      isActive: true,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [
          {
            id: "t2",
            projectId: "p1",
            worktreeId: "w-feat",
            title: "Grouped thread",
            agent: "codex",
            sortOrder: 0,
            createdAt: "2026-04-07T00:01:00Z",
            updatedAt: "2026-04-07T00:01:00Z"
          }
        ],
        activeThreadId: "t2",
        collapsed: true,
        threadGroups: [worktree],
        defaultWorktreeId: "w-default"
      },
      attachTo: document.body
    });

    expect(document.querySelector('[data-testid="thread-group-collapsed-popover"]')).toBeNull();

    await wrapper.get('[data-testid="thread-group-collapsed-trigger"]').trigger("click");

    const popover = document.querySelector('[data-testid="thread-group-collapsed-popover"]');
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("Grouped thread");
    expect(document.querySelectorAll('[data-testid="thread-group-collapsed-popover"] [data-testid="thread-row"]')).toHaveLength(1);
  });

  it("restores the original order and does not emit reorder when drag is canceled", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: reorderedThreads,
        activeThreadId: "t1"
      }
    });

    const dragRows = wrapper.findAll('[data-testid="thread-row"]');
    const dragHandles = wrapper.findAll('[data-testid="thread-drag-handle"]');
    const dataTransfer = createDragData();

    await dragHandles[0]!.trigger("dragstart", { dataTransfer });
    await dragRows[2]!.trigger("dragenter", { dataTransfer });
    await dragHandles[0]!.trigger("dragend", { dataTransfer });

    expect(wrapper.emitted("reorder")).toBeUndefined();
    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Codex CLI · test",
      "Claude Code · docs",
      "Gemini CLI · review"
    ]);
  });
});
