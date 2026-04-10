import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import type { Thread, Worktree } from "@shared/domain";
import type { WorkspaceThreadContext } from "@/stores/workspaceStore";

async function hoverFirstThreadRow(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.get('[data-testid="thread-row"]').trigger("mouseenter");
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
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    }
  ];

  /** Same three threads as `activeProjectThreads` / layout: newest `createdAt` first. */
  const threeThreadsNewestFirst: Thread[] = [
    {
      id: "t3",
      projectId: "p1",
      worktreeId: "w1",
      title: "Gemini CLI · review",
      agent: "gemini",
      createdAt: "2026-04-05T00:02:00.000Z",
      updatedAt: "2026-04-05T00:02:00.000Z"
    },
    {
      id: "t2",
      projectId: "p1",
      worktreeId: "w1",
      title: "Claude Code · docs",
      agent: "claude",
      createdAt: "2026-04-05T00:01:00.000Z",
      updatedAt: "2026-04-05T00:01:00.000Z"
    },
    threads[0]
  ];

  function makeThreadContext(worktree: Worktree, contextThreads: Thread[]): WorkspaceThreadContext {
    return {
      worktreeId: worktree.id,
      worktree,
      displayLabel: worktree.isDefault ? "Primary" : worktree.name,
      isDefault: worktree.isDefault,
      threads: contextThreads
    };
  }

  it("shows icon-only thread rows when collapsed", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: threeThreadsNewestFirst,
        activeThreadId: "t1",
        collapsed: true
      }
    });

    expect(wrapper.attributes("data-thread-sidebar-collapsed")).toBe("true");
    expect(wrapper.findAll('[data-testid="thread-select"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="thread-group-collapsed-trigger"]')).toHaveLength(1);
  });

  it("supports collapsed primary fallback popover without a default worktree id", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: threeThreadsNewestFirst,
        activeThreadId: "t1",
        collapsed: true,
        threadGroups: []
      },
      attachTo: document.body
    });

    const trigger = wrapper.get('[data-testid="thread-group-section-__sidebar-primary__"] [data-testid="thread-group-collapsed-trigger"]');
    expect(trigger.attributes("aria-expanded")).toBe("false");

    await trigger.trigger("click");

    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-testid="thread-group-collapsed-popover"]')?.textContent).toContain("Codex CLI · test");
  });

  it("renders the expand toggle in the top bar when collapsed", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: threeThreadsNewestFirst,
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
        threads: threeThreadsNewestFirst,
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
        activeThreadId: null,
        projectId: "p1"
      }
    });

    expect(wrapper.text()).toContain("No threads");
    expect(wrapper.text()).not.toContain("No threads yet");
    expect(wrapper.find('[aria-label="Add worktree"]').exists()).toBe(true);
  });

  it("renders a labeled add-worktree button in the footer when expanded", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        projectId: "p1"
      }
    });

    expect(wrapper.get('[aria-label="Add worktree"]').text()).toContain("Add worktree");
  });

  it("renders a larger add-worktree button in the footer when expanded", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        projectId: "p1"
      }
    });

    const button = wrapper.get('[aria-label="Add worktree"]');
    expect(button.attributes("data-size")).toBe("lg");
    expect(button.classes()).toContain("h-9");
    expect(button.classes()).toContain("gap-1.5");
    expect(button.classes()).toContain("px-2.5");
  });

  it("renders an icon-only add-worktree button in the footer when collapsed", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        collapsed: true,
        projectId: "p1"
      }
    });

    expect(wrapper.get('[aria-label="Add worktree"]').text()).toBe("");
  });

  it("emits showBranchPicker when add worktree is clicked and cancelBranchPicker when cancel", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        projectId: "p1"
      }
    });

    await wrapper.get('[aria-label="Add worktree"]').trigger("click");
    await nextTick();
    expect(wrapper.emitted("showBranchPicker")).toEqual([[]]);

    wrapper.setProps({ showBranchPicker: true });
    await nextTick();

    await wrapper.get('[aria-label="Cancel add worktree"]').trigger("click");
    await nextTick();
    expect(wrapper.emitted("cancelBranchPicker")).toEqual([[]]);
  });

  it("expands the sidebar before showing worktree form when collapsed footer button is clicked", async () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        collapsed: true,
        projectId: "p1"
      }
    });

    await wrapper.get('[data-testid="thread-sidebar-footer-worktree-toggle"]').trigger("click");

    expect(wrapper.emitted("expand")).toEqual([[]]);
    expect(wrapper.emitted("showBranchPicker")).toEqual([[]]);
  });

  it("shows only one cancel control when the footer branch picker is open", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads,
        activeThreadId: "t1",
        projectId: "p1",
        showBranchPicker: true
      }
    });

    expect(wrapper.findAll("button").filter((node) => node.text().trim() === "Cancel")).toHaveLength(1);
  });

  it("emits remove with threadId when a ThreadRow archive is confirmed in the window", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    wrapper = mount(ThreadSidebar, { attachTo: document.body, props: { threads, activeThreadId: "t1" } });
    await hoverFirstThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-archive"]').trigger("click");
    expect(confirmSpy).toHaveBeenCalled();
    expect(wrapper.emitted("remove")).toEqual([["t1"]]);
    confirmSpy.mockRestore();
  });

  it("emits rename with threadId and new title when a ThreadRow emits rename", async () => {
    wrapper = mount(ThreadSidebar, { props: { threads, activeThreadId: "t1" } });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    await input.setValue("Renamed");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["t1", "Renamed"]]);
  });

  it("lists threads newest-first (matches workspace store ordering)", () => {
    wrapper = mount(ThreadSidebar, {
      props: {
        threads: threeThreadsNewestFirst,
        activeThreadId: "t1"
      }
    });

    expect(wrapper.findAll('[data-testid="thread-select"]').map((node) => node.text())).toEqual([
      "Gemini CLI · review",
      "Claude Code · docs",
      "Codex CLI · test"
    ]);
  });

  it("renders threads grouped by worktree with group headers", () => {
    const ungroupedThreads: Thread[] = [
      {
        id: "t1",
        projectId: "p1",
        worktreeId: "w-default",
        title: "Ungrouped thread",
        agent: "claude",
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
        createdAt: "2026-04-07T00:01:00Z",
        updatedAt: "2026-04-07T00:01:00Z"
      }
    ];
    const linkedWorktree: Worktree = {
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

    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [...ungroupedThreads, ...groupedThreads],
        activeThreadId: "t1",
        threadContexts: [
          makeThreadContext(defaultWorktree, ungroupedThreads),
          makeThreadContext(linkedWorktree, groupedThreads)
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.findAll('[data-testid="thread-group-header"]').map((node) => node.text())).toEqual([
      expect.stringContaining("Primary"),
      expect.stringContaining("feat/auth")
    ]);
    expect(wrapper.get('[data-thread-group-id="w-default"]').text()).toContain("Primary");
    expect(wrapper.get('[data-thread-group-id="w-feat"]').text()).toContain("feat/auth");
    expect(
      wrapper.findAll('[data-testid="thread-group-header"]').map((node) => node.attributes("aria-expanded"))
    ).toEqual(["true", "false"]);
    expect(wrapper.find('[data-testid="thread-group-threads-w-default"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-testid="thread-group-threads-w-feat"]').isVisible()).toBe(false);
    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(2);
  });

  it("expands the active linked context by default and collapses primary when inactive", () => {
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThread: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };
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
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread],
        activeThreadId: "t2",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(worktree, [groupedThread])
        ],
        threadGroups: [worktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.get('[data-thread-group-id="w-default"]').attributes("aria-expanded")).toBe("false");
    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");
    expect(wrapper.find('[data-testid="thread-group-threads-w-default"]').isVisible()).toBe(false);
    expect(wrapper.find('[data-testid="thread-group-threads-w-feat"]').isVisible()).toBe(true);
  });

  it("emits select for threads clicked inside grouped contexts", async () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    } satisfies Thread;
    const groupedThread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    } satisfies Thread;

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread],
        activeThreadId: "t1",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, [groupedThread])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    await wrapper.get('[data-thread-group-id="w-feat"]').trigger("click");
    await wrapper
      .get('[data-testid="thread-list-item-t2"] [data-testid="thread-select"]')
      .trigger("click");

    expect(wrapper.emitted("select")).toEqual([["t2"]]);
  });

  it("expands the newly active context when the active thread changes", async () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThread: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread],
        activeThreadId: "t1",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, [groupedThread])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("false");

    await wrapper.setProps({
      activeThreadId: "t2",
      threadContexts: [
        makeThreadContext(defaultWorktree, [primaryThread]),
        makeThreadContext(linkedWorktree, [groupedThread])
      ]
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");
    expect(wrapper.find('[data-testid="thread-group-threads-w-feat"]').isVisible()).toBe(true);
  });

  it("renders grouped threadContexts in the order supplied (newest-first from the store)", () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThreadsNewestFirst: Thread[] = [
      {
        id: "t3",
        projectId: "p1",
        worktreeId: "w-feat",
        title: "Grouped thread B",
        agent: "gemini",
        createdAt: "2026-04-07T00:02:00Z",
        updatedAt: "2026-04-07T00:02:00Z"
      },
      {
        id: "t2",
        projectId: "p1",
        worktreeId: "w-feat",
        title: "Grouped thread A",
        agent: "codex",
        createdAt: "2026-04-07T00:01:00Z",
        updatedAt: "2026-04-07T00:01:00Z"
      }
    ];

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, ...groupedThreadsNewestFirst],
        activeThreadId: "t2",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, groupedThreadsNewestFirst)
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(
      wrapper
        .find('[data-testid="thread-group-threads-w-feat"]')
        .findAll('[data-testid="thread-select"]')
        .map((node) => node.text())
    ).toEqual(["Grouped thread B", "Grouped thread A"]);
  });

  it("keeps extra same-worktree threads visible in front of context threads", () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThreadA: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread A",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };
    const groupedThreadB: Thread = {
      id: "t3",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread B",
      agent: "gemini",
      createdAt: "2026-04-07T00:02:00Z",
      updatedAt: "2026-04-07T00:02:00Z"
    };
    const groupedThreadOutsideContext: Thread = {
      id: "t4",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Hidden same-worktree thread",
      agent: "claude",
      createdAt: "2026-04-07T00:03:00Z",
      updatedAt: "2026-04-07T00:03:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThreadOutsideContext, groupedThreadB, groupedThreadA],
        activeThreadId: "t2",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, [groupedThreadB, groupedThreadA])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(
      wrapper
        .find('[data-testid="thread-group-threads-w-feat"]')
        .findAll('[data-testid="thread-select"]')
        .map((node) => node.text())
    ).toEqual(["Hidden same-worktree thread", "Grouped thread B", "Grouped thread A"]);
  });

  it("appends fallback groups for threads whose worktree is missing from threadContexts entirely", () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThread: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };
    const uncoveredThread: Thread = {
      id: "t3",
      projectId: "p1",
      worktreeId: "w-untracked",
      title: "Recovered fallback thread",
      agent: "gemini",
      createdAt: "2026-04-07T00:02:00Z",
      updatedAt: "2026-04-07T00:02:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread, uncoveredThread],
        activeThreadId: "t1",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, [groupedThread])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.findAll('[data-testid="thread-group-header"]').map((node) => node.text())).toEqual([
      expect.stringContaining("Primary"),
      expect.stringContaining("feat/auth"),
      expect.stringContaining("w-untracked")
    ]);
    expect(wrapper.text()).toContain("Recovered fallback thread");
    expect(wrapper.find('[data-testid="thread-group-threads-w-untracked"]').isVisible()).toBe(false);
  });

  it("renders fallback Primary first when threadContexts omits the default context", () => {
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThread: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread],
        activeThreadId: "t1",
        threadContexts: [makeThreadContext(linkedWorktree, [groupedThread])],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.findAll('[data-testid="thread-group-header"]').map((node) => node.text())).toEqual([
      expect.stringContaining("Primary"),
      expect.stringContaining("feat/auth")
    ]);
    expect(wrapper.findAll('[data-testid="thread-group-header"]')[0]!.text()).toContain("Primary");
  });

  it("preserves manual expand state when a group disappears and later reappears", async () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThread: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread],
        activeThreadId: "t1",
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, [groupedThread])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("false");

    await wrapper.get('[data-thread-group-id="w-feat"]').trigger("click");
    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");

    await wrapper.setProps({
      threads: [primaryThread],
      threadContexts: [makeThreadContext(defaultWorktree, [primaryThread])]
    });

    expect(wrapper.find('[data-thread-group-id="w-feat"]').exists()).toBe(false);

    await wrapper.setProps({
      threads: [primaryThread, groupedThread],
      threadContexts: [
        makeThreadContext(defaultWorktree, [primaryThread]),
        makeThreadContext(linkedWorktree, [groupedThread])
      ]
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");
    expect(wrapper.find('[data-testid="thread-group-threads-w-feat"]').isVisible()).toBe(true);
  });

  it("keeps manual collapse preference while active and restores it once inactive again", async () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/project",
      isActive: false,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const linkedWorktree: Worktree = {
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
    const primaryThread: Thread = {
      id: "t1",
      projectId: "p1",
      worktreeId: "w-default",
      title: "Primary thread",
      agent: "claude",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };
    const groupedThread: Thread = {
      id: "t2",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Grouped thread",
      agent: "codex",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: [primaryThread, groupedThread],
        activeThreadId: null,
        threadContexts: [
          makeThreadContext(defaultWorktree, [primaryThread]),
          makeThreadContext(linkedWorktree, [groupedThread])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("false");

    await wrapper.get('[data-thread-group-id="w-feat"]').trigger("click");
    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");

    await wrapper.get('[data-thread-group-id="w-feat"]').trigger("click");
    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("false");

    await wrapper.setProps({
      activeThreadId: "t2",
      threadContexts: [
        makeThreadContext(defaultWorktree, [primaryThread]),
        makeThreadContext(linkedWorktree, [groupedThread])
      ]
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");

    await wrapper.setProps({
      threadContexts: [
        makeThreadContext(defaultWorktree, [primaryThread]),
        makeThreadContext(linkedWorktree, [groupedThread])
      ]
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");
    expect(wrapper.find('[data-testid="thread-group-threads-w-feat"]').isVisible()).toBe(true);

    await wrapper.setProps({
      activeThreadId: "t1",
      threadContexts: [
        makeThreadContext(defaultWorktree, [primaryThread]),
        makeThreadContext(linkedWorktree, [groupedThread])
      ]
    });

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("false");
    expect(
      (wrapper.get('[data-testid="thread-group-threads-w-feat"]').element as HTMLElement).style.display
    ).toBe("none");
  });

  it("lists threads in collapsed group popovers without drag handles", async () => {
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
    const groupThreads: Thread[] = [
      {
        id: "t2",
        projectId: "p1",
        worktreeId: "w-feat",
        title: "Grouped thread A",
        agent: "codex",
        createdAt: "2026-04-07T00:01:00Z",
        updatedAt: "2026-04-07T00:01:00Z"
      },
      {
        id: "t3",
        projectId: "p1",
        worktreeId: "w-feat",
        title: "Grouped thread B",
        agent: "gemini",
        createdAt: "2026-04-07T00:02:00Z",
        updatedAt: "2026-04-07T00:02:00Z"
      }
    ];

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: groupThreads,
        activeThreadId: "t2",
        collapsed: true,
        threadGroups: [worktree],
        defaultWorktreeId: "w-default"
      },
      attachTo: document.body
    });

    await wrapper
      .get('[data-testid="thread-group-section-w-feat"] [data-testid="thread-group-collapsed-trigger"]')
      .trigger("click");

    const popover = document.querySelector('[data-testid="thread-group-collapsed-popover"]');
    expect(popover).not.toBeNull();
    expect(popover?.querySelectorAll('[data-testid="thread-drag-handle"]')).toHaveLength(0);
    expect(popover?.querySelectorAll('[data-testid="thread-row"]')).toHaveLength(2);
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
            createdAt: "2026-04-07T00:01:00Z",
            updatedAt: "2026-04-07T00:01:00Z"
          }
        ],
        activeThreadId: null,
        threadGroups: [worktree],
        defaultWorktreeId: "w-default",
        staleWorktreeIds: new Set(["w-feat"])
      }
    });

    await wrapper.get('[data-thread-group-id="w-feat"]').trigger("click");

    expect(wrapper.text()).toContain("Delete group & threads");

    await wrapper.get('[data-thread-group-id="w-feat"]').trigger("click");

    expect(wrapper.findComponent({ name: "WorktreeStaleCallout" }).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Delete group & threads");
  });

  it("uses the worktree name on the collapsed group trigger", async () => {
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

    expect(
      wrapper
        .get('[data-testid="thread-group-section-w-feat"] [data-testid="thread-group-collapsed-trigger"]')
        .attributes("aria-label")
    ).toBe("Worktree feat/auth");
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

    await wrapper
      .get('[data-testid="thread-group-section-w-feat"] [data-testid="thread-group-collapsed-trigger"]')
      .trigger("click");

    const popover = document.querySelector('[data-testid="thread-group-collapsed-popover"]');
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain("Grouped thread");
    expect(document.querySelectorAll('[data-testid="thread-group-collapsed-popover"] [data-testid="thread-row"]')).toHaveLength(1);
  });

  it("shows 12 threads with Show more, then full list with Show less", async () => {
    const manyThreads: Thread[] = Array.from({ length: 13 }, (_, i) => ({
      id: `t${i + 1}`,
      projectId: "p1",
      worktreeId: "w1",
      title: `Thread ${i + 1}`,
      agent: "claude",
      createdAt: `2026-04-05T00:${String(i).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-04-05T00:${String(i).padStart(2, "0")}:00.000Z`
    }));

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: manyThreads,
        activeThreadId: "t1",
        defaultWorktreeId: "w1"
      }
    });

    const list = wrapper.get('[data-testid="thread-group-threads-w1"]');
    expect(list.findAll('[data-testid="thread-row"]')).toHaveLength(12);
    expect(wrapper.find('[data-testid="thread-group-show-more-w1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="thread-group-show-less-w1"]').exists()).toBe(false);

    await wrapper.get('[data-testid="thread-group-show-more-w1"]').trigger("click");
    await nextTick();

    expect(list.findAll('[data-testid="thread-row"]')).toHaveLength(13);
    expect(wrapper.find('[data-testid="thread-group-show-more-w1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="thread-group-show-less-w1"]').exists()).toBe(true);

    await wrapper.get('[data-testid="thread-group-show-less-w1"]').trigger("click");
    await nextTick();

    expect(list.findAll('[data-testid="thread-row"]')).toHaveLength(12);
    expect(wrapper.find('[data-testid="thread-group-show-more-w1"]').exists()).toBe(true);
  });

  it("auto-expands the thread list when the active thread is past the 12th row", async () => {
    const manyThreads: Thread[] = Array.from({ length: 13 }, (_, i) => ({
      id: `t${i + 1}`,
      projectId: "p1",
      worktreeId: "w1",
      title: `Thread ${i + 1}`,
      agent: "claude",
      createdAt: `2026-04-05T00:${String(i).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-04-05T00:${String(i).padStart(2, "0")}:00.000Z`
    }));

    wrapper = mount(ThreadSidebar, {
      props: {
        threads: manyThreads,
        activeThreadId: "t13",
        defaultWorktreeId: "w1"
      }
    });

    const list = wrapper.get('[data-testid="thread-group-threads-w1"]');
    expect(list.findAll('[data-testid="thread-row"]')).toHaveLength(13);
    expect(wrapper.find('[data-testid="thread-group-show-less-w1"]').exists()).toBe(true);
  });

});
