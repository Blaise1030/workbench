import { mount } from "@vue/test-utils";
import type { ComponentMountingOptions } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThreadSidebar from "@/components/ThreadSidebar.vue";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RunStatus, Thread, Worktree } from "@shared/domain";
import type { WorkspaceThreadContext } from "@/stores/workspaceStore";

async function hoverFirstThreadRow(wrapper: ReturnType<typeof mountThreadSidebar>): Promise<void> {
  await wrapper.get('[data-testid="thread-row"]').trigger("mouseenter");
}

/**
 * Wraps `ThreadSidebar` with `TooltipProvider` (same as production `App.vue`) and forwards props + emits
 * so `mount(...).setProps` / `wrapper.emitted()` target the test host root.
 */
const ThreadSidebarTestHost = defineComponent({
  name: "ThreadSidebarTestHost",
  props: {
    threads: { type: Array as PropType<Thread[]>, required: true },
    activeThreadId: { type: String as PropType<string | null>, default: null },
    collapsed: { type: Boolean, default: false },
    runStatusByThreadId: { type: Object as PropType<Record<string, RunStatus>>, default: undefined },
    idleAttentionByThreadId: { type: Object as PropType<Record<string, boolean>>, default: undefined },
    threadGroups: { type: Array as PropType<Worktree[]>, default: () => [] },
    threadContexts: { type: Array as PropType<WorkspaceThreadContext[]>, default: undefined },
    contextLabel: { type: String as PropType<string | null | undefined>, default: undefined },
    defaultWorktreeId: { type: String as PropType<string | null | undefined>, default: undefined },
    staleWorktreeIds: {
      type: Object as PropType<ReadonlySet<string>>,
      default: () => new Set<string>()
    },
    showBranchPicker: { type: Boolean, default: false },
    projectId: { type: String as PropType<string | null>, default: null }
  },
  emits: [
    "select",
    "remove",
    "rename",
    "addThreadInline",
    "createWorktreeGroup",
    "cancelBranchPicker",
    "showBranchPicker",
    "deleteWorktreeGroup",
    "collapse",
    "expand"
  ],
  setup(props, { emit }) {
    return () =>
      h(TooltipProvider, null, {
        default: () =>
          h(ThreadSidebar, {
            threads: props.threads,
            activeThreadId: props.activeThreadId,
            collapsed: props.collapsed,
            runStatusByThreadId: props.runStatusByThreadId,
            idleAttentionByThreadId: props.idleAttentionByThreadId,
            threadGroups: props.threadGroups,
            threadContexts: props.threadContexts,
            contextLabel: props.contextLabel,
            defaultWorktreeId: props.defaultWorktreeId,
            staleWorktreeIds: props.staleWorktreeIds,
            showBranchPicker: props.showBranchPicker,
            projectId: props.projectId,
            onSelect: (threadId: string) => emit("select", threadId),
            onRemove: (threadId: string) => emit("remove", threadId),
            onRename: (threadId: string, newTitle: string) => emit("rename", threadId, newTitle),
            onAddThreadInline: (worktreeId: string) => emit("addThreadInline", worktreeId),
            onCreateWorktreeGroup: (branch: string, baseBranch: string | null) =>
              emit("createWorktreeGroup", branch, baseBranch),
            onCancelBranchPicker: () => emit("cancelBranchPicker"),
            onShowBranchPicker: () => emit("showBranchPicker"),
            onDeleteWorktreeGroup: (worktreeId: string) => emit("deleteWorktreeGroup", worktreeId),
            onCollapse: () => emit("collapse"),
            onExpand: () => emit("expand")
          })
      });
  }
});

function mountThreadSidebar(options?: ComponentMountingOptions<typeof ThreadSidebar>) {
  return mount(ThreadSidebarTestHost, options as ComponentMountingOptions<typeof ThreadSidebarTestHost>);
}

describe("ThreadSidebar", () => {
  let wrapper: ReturnType<typeof mountThreadSidebar>;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

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
      displayLabel: worktree.isDefault ? (worktree.branch?.trim() || "Primary") : worktree.name,
      isDefault: worktree.isDefault,
      threads: contextThreads
    };
  }

  it("marks the sidebar as collapsed and hides the rail", () => {
    wrapper = mountThreadSidebar( {
      props: {
        threads: threeThreadsNewestFirst,
        activeThreadId: "t1",
        collapsed: true
      }
    });

    expect(wrapper.get("aside").attributes("data-thread-sidebar-collapsed")).toBe("true");
    expect(wrapper.get("aside").classes()).toContain("hidden");
  });

  it("renders a primary fallback group without a default worktree id", async () => {
    wrapper = mountThreadSidebar( {
      props: {
        threads: threeThreadsNewestFirst,
        activeThreadId: "t1",
        collapsed: true,
        threadGroups: []
      },
      attachTo: document.body
    });

    expect(wrapper.find('[data-thread-group-id="__sidebar-primary__"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(3);
  });

  it("renders the expand toggle in the top bar when collapsed", async () => {
    wrapper = mountThreadSidebar( {
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
    wrapper = mountThreadSidebar( {
      props: {
        threads: threeThreadsNewestFirst,
        activeThreadId: "t1"
      }
    });

    await wrapper.get('[aria-label="Collapse threads sidebar"]').trigger("click");

    expect(wrapper.emitted("collapse")).toEqual([[]]);
  });

  it("shows a simple top-aligned no-threads label when empty", () => {
    wrapper = mountThreadSidebar( {
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

  it("emits addThreadInline from empty-state CTA when primary context exists without defaultWorktreeId", async () => {
    const defaultWorktree: Worktree = {
      id: "w-default",
      projectId: "p1",
      name: "main",
      branch: "main",
      path: "/tmp/repo",
      isActive: true,
      isDefault: true,
      baseBranch: null,
      lastActiveThreadId: null,
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mountThreadSidebar({
      props: {
        threads: [],
        activeThreadId: null,
        projectId: "p1",
        threadContexts: [makeThreadContext(defaultWorktree, [])]
      }
    });

    await wrapper.get('[data-testid="thread-sidebar-empty-add-thread"]').trigger("click");

    expect(wrapper.emitted("addThreadInline")).toEqual([["w-default"]]);
  });

  it("keeps add-thread affordances visible for populated worktree contexts", () => {
    const linkedWorktree: Worktree = {
      id: "w-feat",
      projectId: "p1",
      name: "feat/auth",
      branch: "feat/auth",
      path: "/tmp/.worktrees/feat-auth",
      isActive: true,
      isDefault: false,
      baseBranch: "main",
      lastActiveThreadId: "t2",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z"
    };

    wrapper = mountThreadSidebar( {
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
        threadContexts: [makeThreadContext(linkedWorktree, [
          {
            id: "t2",
            projectId: "p1",
            worktreeId: "w-feat",
            title: "Grouped thread",
            agent: "codex",
            createdAt: "2026-04-07T00:01:00Z",
            updatedAt: "2026-04-07T00:01:00Z"
          }
        ])],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.find('[aria-label="Add thread to feat/auth"]').exists()).toBe(true);
  });

  it("renders a labeled add-worktree button in the footer when expanded", () => {
    wrapper = mountThreadSidebar( {
      props: {
        threads,
        activeThreadId: "t1",
        projectId: "p1"
      }
    });

    expect(wrapper.get('[aria-label="Add worktree"]').text()).toContain("Add worktree");
  });

  it("renders a larger add-worktree button in the footer when expanded", () => {
    wrapper = mountThreadSidebar( {
      props: {
        threads,
        activeThreadId: "t1",
        projectId: "p1"
      }
    });

    const button = wrapper.get('[aria-label="Add worktree"]');
    expect(button.attributes("data-size")).toBe("xs");
    expect(button.classes()).toContain("self-center");
    expect(button.classes()).toContain("rounded-md");
  });

  it("renders an icon-only add-worktree button in the footer when collapsed", () => {
    wrapper = mountThreadSidebar( {
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
    wrapper = mountThreadSidebar( {
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
    wrapper = mountThreadSidebar( {
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
    wrapper = mountThreadSidebar( {
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
    wrapper = mountThreadSidebar( { attachTo: document.body, props: { threads, activeThreadId: "t1" } });
    await hoverFirstThreadRow(wrapper);
    await wrapper.get('[data-testid="thread-archive"]').trigger("click");
    expect(confirmSpy).toHaveBeenCalled();
    expect(wrapper.emitted("remove")).toEqual([["t1"]]);
    confirmSpy.mockRestore();
  });

  it("emits rename with threadId and new title when a ThreadRow emits rename", async () => {
    wrapper = mountThreadSidebar( { props: { threads, activeThreadId: "t1" } });
    await wrapper.get('[data-testid="thread-select"]').trigger("dblclick");
    const input = wrapper.get('[data-testid="thread-rename-input"]');
    (input.element as HTMLElement).textContent = "Renamed";
    await input.trigger("input");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("rename")).toEqual([["t1", "Renamed"]]);
  });

  it("lists threads newest-first (matches workspace store ordering)", () => {
    wrapper = mountThreadSidebar( {
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

  it("filters threads by created branch when filter toggle is on", async () => {
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
    const onBranch: Thread = {
      id: "t-match",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "On branch",
      agent: "codex",
      createdBranch: "feat/auth",
      createdAt: "2026-04-07T00:02:00Z",
      updatedAt: "2026-04-07T00:02:00Z"
    };
    const offBranch: Thread = {
      id: "t-other",
      projectId: "p1",
      worktreeId: "w-feat",
      title: "Other branch",
      agent: "claude",
      createdBranch: "main",
      createdAt: "2026-04-07T00:01:00Z",
      updatedAt: "2026-04-07T00:01:00Z"
    };

    wrapper = mountThreadSidebar( {
      props: {
        threads: [onBranch, offBranch],
        activeThreadId: "t-match",
        threadContexts: [
          makeThreadContext(defaultWorktree, []),
          makeThreadContext(linkedWorktree, [onBranch, offBranch])
        ],
        threadGroups: [linkedWorktree],
        defaultWorktreeId: "w-default"
      }
    });

    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(2);

    const filterControl = wrapper.get('[data-testid="thread-sidebar-filter-current-branch"]');
    await filterControl.trigger("click");

    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="thread-row"]').text()).toContain("On branch");

    await filterControl.trigger("click");
    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(2);
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

    wrapper = mountThreadSidebar( {
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
      expect.stringContaining("main"),
      expect.stringContaining("feat/auth")
    ]);
    expect(wrapper.get('[data-thread-group-id="w-default"]').text()).toContain("main");
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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
      expect.stringContaining("main"),
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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

  it("lists collapsed group threads without drag handles", async () => {
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

    wrapper = mountThreadSidebar( {
      props: {
        threads: groupThreads,
        activeThreadId: "t2",
        collapsed: true,
        threadGroups: [worktree],
        defaultWorktreeId: "w-default"
      },
      attachTo: document.body
    });

    expect(wrapper.findAll('[data-testid="thread-drag-handle"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(2);
  });

  it("keeps stale worktree callouts out of view when the sidebar is collapsed", () => {
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

    wrapper = mountThreadSidebar( {
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

    expect(wrapper.get("aside").classes()).toContain("hidden");
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

    wrapper = mountThreadSidebar( {
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

  it("uses the worktree name in the group header when collapsed", async () => {
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

    wrapper = mountThreadSidebar( {
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

    expect(wrapper.get('[data-thread-group-id="w-feat"]').text()).toContain("feat/auth");
  });

  it("renders grouped thread rows when collapsed", async () => {
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

    wrapper = mountThreadSidebar( {
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

    expect(wrapper.get('[data-thread-group-id="w-feat"]').attributes("aria-expanded")).toBe("true");
    expect(wrapper.findAll('[data-testid="thread-row"]')).toHaveLength(1);
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

    wrapper = mountThreadSidebar( {
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

    wrapper = mountThreadSidebar( {
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
