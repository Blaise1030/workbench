import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTabs from "@/components/ProjectTabs.vue";
import type { Project, Thread } from "@shared/domain";

describe("ProjectTabs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
    expect(tab.classes().some((c) => c.includes("bg-blue-500/12"))).toBe(true);
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
    // Settings sits inside a `relative` wrapper; the cluster row with vertical centering is the grandparent.
    const actionCluster = wrapper.get('[aria-label="Settings"]').element.parentElement?.parentElement;

    expect(nav.classes()).toContain("items-center");
    expect(tabList.classes()).toContain("items-center");
    expect(tabList.classes()).toContain("h-full");
    expect(actionCluster?.className).toContain("self-center");
  });

  it("teleports workspace details under the body when hovering a tab row", async () => {
    const worktrees = [
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
    ];
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects,
        worktrees,
        activeProjectId: null
      }
    });

    await wrapper.get('[data-testid="project-tab-row-proj-1"]').trigger("mouseenter");
    await nextTick();

    const panel1 = document.querySelector('[data-testid="project-hover-details-proj-1"]');
    expect(panel1?.textContent).toContain("/tmp/project-one");
    expect(panel1?.textContent).not.toContain("/tmp/project-two");

    await wrapper.get('[data-testid="project-tab-row-proj-2"]').trigger("mouseenter");
    await nextTick();

    const panel2 = document.querySelector('[data-testid="project-hover-details-proj-2"]');
    expect(panel2?.textContent).toContain("/tmp/project-two");
    expect(panel2?.textContent).not.toContain("/tmp/project-one");

    wrapper.unmount();
  });

  it("dismisses the hover details panel when a project tab is clicked", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1"
      }
    });

    await wrapper.get('[data-testid="project-tab-row-proj-1"]').trigger("mouseenter");
    await nextTick();
    expect(document.querySelector('[data-testid="project-hover-details-proj-1"]')).toBeTruthy();

    await wrapper.get('[data-project-id="proj-1"]').trigger("click");
    await nextTick();
    expect(document.querySelector('[data-testid="project-hover-details-proj-1"]')).toBeNull();

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
