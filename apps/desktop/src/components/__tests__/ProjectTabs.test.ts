import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, provide, inject, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTabs from "@/components/ProjectTabs.vue";
import type { Project, Thread } from "@shared/domain";

const hoverCardOpenKey = Symbol("hover-card-open");

vi.mock("@/components/ui/hover-card", () => {
  const HoverCard = defineComponent({
    name: "HoverCardMock",
    props: {
      openDelay: { type: Number, default: 0 },
      closeDelay: { type: Number, default: 0 }
    },
    emits: ["update:open"],
    setup(_props, { slots, emit }) {
      const open = ref(false);
      const setOpen = (value: boolean) => {
        open.value = value;
        emit("update:open", value);
      };
      provide(hoverCardOpenKey, { open, setOpen });
      return () => slots.default?.();
    }
  });

  const HoverCardTrigger = defineComponent({
    name: "HoverCardTriggerMock",
    props: {
      asChild: { type: Boolean, default: false }
    },
    setup(props, { slots, attrs }) {
      const api = inject<{ open: { value: boolean }; setOpen: (value: boolean) => void }>(hoverCardOpenKey)!;
      return () => {
        const child = slots.default?.()[0];
        if (!child) return null;
        const mergedProps = {
          ...attrs,
          ...(child.props ?? {}),
          onMouseenter: (event: MouseEvent) => {
            api.setOpen(true);
            const existing = child.props?.onMouseenter;
            if (typeof existing === "function") existing(event);
          },
          onMouseleave: (event: MouseEvent) => {
            api.setOpen(false);
            const existing = child.props?.onMouseleave;
            if (typeof existing === "function") existing(event);
          }
        };
        return props.asChild ? h(child.type as never, mergedProps, child.children) : h("div", mergedProps, slots.default?.());
      };
    }
  });

  const HoverCardContent = defineComponent({
    name: "HoverCardContentMock",
    setup(_props, { slots, attrs }) {
      const api = inject<{ open: { value: boolean } }>(hoverCardOpenKey)!;
      return () => (api.open.value ? h("div", attrs, slots.default?.()) : null);
    }
  });

  return { HoverCard, HoverCardTrigger, HoverCardContent };
});

async function openProjectHoverCard(
  wrapper: ReturnType<typeof mount<typeof ProjectTabs>>,
  projectId: string
): Promise<void> {
  await wrapper.get(`[data-project-id="${projectId}"]`).trigger("mouseenter");
}

describe("ProjectTabs", () => {
  beforeEach(() => {
    window.workspaceApi = {
      ptyListSessions: vi.fn().mockResolvedValue([])
    } as WorkspaceApi;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete window.workspaceApi;
  });

  const projects: Project[] = [
    {
      id: "proj-1",
      name: "Project One",
      repoPath: "/tmp/project-one",
      status: "idle",
      tabOrder: 0,
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    },
    {
      id: "proj-2",
      name: "Project Two",
      repoPath: "/tmp/project-two",
      status: "idle",
      tabOrder: 1,
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    }
  ];

  it("emits select for clicked project", async () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });

    await wrapper.get('[data-project-id="proj-2"]').trigger("click");
    expect(wrapper.emitted("select")).toEqual([["proj-2"]]);
  });

  it("adds attention ring and data attribute when a thread in that project needs idle attention", () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1",
        threads: [
          {
            id: "t1",
            projectId: "proj-2",
            worktreeId: "w2",
            title: "Side thread",
            agent: "claude",
            createdAt: "2026-04-05T00:00:00.000Z",
            updatedAt: "2026-04-05T00:00:00.000Z"
          }
        ],
        idleAttentionByThreadId: { t1: true },
        runStatusByThreadId: {}
      }
    });

    const tab = wrapper.get('[data-project-id="proj-2"]');
    expect(tab.attributes("data-needs-attention")).toBe("idle");
    expect(tab.classes().some((c) => c.includes("ring-blue"))).toBe(true);
  });

  it("emits create when plus button is clicked", async () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });

    const createBtn = wrapper.find('[aria-label="Create project"]');
    expect(createBtn.exists()).toBe(true);
    await createBtn.trigger("click");
    expect(wrapper.emitted("create")).toHaveLength(1);
  });

  it("emits remove for the close control without selecting the project", async () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });

    const removeBtn = wrapper.get('[data-testid="remove-project-tab-proj-2"]');
    await removeBtn.trigger("click");

    expect(wrapper.emitted("remove")).toEqual([["proj-2"]]);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("shows the close button by default for the active tab, reserves width for it, and reveals it on hover for inactive tabs", () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });

    const activeClose = wrapper.get('[data-testid="remove-project-tab-proj-1"]');
    const inactiveClose = wrapper.get('[data-testid="remove-project-tab-proj-2"]');

    expect(activeClose.classes()).toContain("opacity-100");
    expect(activeClose.classes()).not.toContain("opacity-0");
    expect(activeClose.classes()).toContain("p-0");
    expect(inactiveClose.classes()).toContain("opacity-0");
    expect(inactiveClose.classes()).toContain("group-hover:opacity-100");
    expect(inactiveClose.classes()).toContain("focus-visible:opacity-100");
    expect(wrapper.get('[data-project-id="proj-1"]').classes()).toContain("pr-8");
    expect(wrapper.get('[data-project-id="proj-2"]').classes()).toContain("pr-8");
  });

  it("emits configureCommands when settings is clicked", async () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });
    await wrapper.get('[aria-label="Settings"]').trigger("click");
    expect(wrapper.emitted("configureCommands")).toEqual([[]]);
  });

  it("keeps the tab strip and action cluster vertically centered", () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });

    const nav = wrapper.get('nav[aria-label="Projects"]');
    const tabList = wrapper.get('[role="tablist"]');
    const actionCluster = wrapper.get('[aria-label="Settings"]').element.parentElement;

    expect(nav.classes()).toContain("items-center");
    expect(tabList.classes()).toContain("items-center");
    expect(tabList.classes()).toContain("h-full");
    expect(actionCluster?.className).toContain("self-center");
  });

  it("anchors the hover card to the hovered project tab", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects,
        worktrees: [
          {
            id: "w1",
            projectId: "proj-1",
            branch: "main",
            path: "/tmp/project-one",
            name: "project-one",
            isMain: true
          },
          {
            id: "w2",
            projectId: "proj-2",
            branch: "main",
            path: "/tmp/project-two",
            name: "project-two",
            isMain: true
          }
        ],
        activeProjectId: "proj-1"
      }
    });

    await openProjectHoverCard(wrapper, "proj-1");
    await nextTick();

    const firstTip = document.querySelector('[role="tooltip"]');
    expect(firstTip?.textContent).toContain("/tmp/project-one");
    const firstTabItem = wrapper.get('[data-project-id="proj-1"]').element.parentElement;
    expect(firstTabItem?.textContent).toContain("/tmp/project-one");

    await wrapper.get('[data-project-id="proj-1"]').trigger("mouseleave");
    await wrapper.get('[data-project-id="proj-2"]').trigger("mouseenter");
    await nextTick();

    const secondTip = document.querySelectorAll('[role="tooltip"]')[0];
    expect(secondTip?.textContent).toContain("/tmp/project-two");
    expect(secondTip?.textContent).not.toContain("/tmp/project-one");
    const secondTabItem = wrapper.get('[data-project-id="proj-2"]').element.parentElement;
    expect(secondTabItem?.textContent).toContain("/tmp/project-two");
    expect(firstTabItem?.textContent).not.toContain("/tmp/project-two");

    await wrapper.get('[data-project-id="proj-2"]').trigger("mouseleave");
    await nextTick();

    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    wrapper.unmount();
  });

  it("emits reorder when a tab is dropped on another slot", async () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });
    const dt = {
      setData: vi.fn(),
      getData: vi.fn(() => "proj-2"),
      effectAllowed: "move"
    };
    await wrapper.get('[data-testid="project-tab-row-proj-2"]').trigger("dragstart", { dataTransfer: dt });
    await wrapper.get('[data-testid="project-tab-row-proj-1"]').trigger("drop", {
      dataTransfer: dt,
      preventDefault: vi.fn()
    });
    expect(wrapper.emitted("reorder")?.[0]).toEqual([["proj-2", "proj-1"]]);
  });
});
