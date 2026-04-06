import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ProjectTabs from "@/components/ProjectTabs.vue";
import type { Project, Thread } from "@shared/domain";

describe("ProjectTabs", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const projects: Project[] = [
    {
      id: "proj-1",
      name: "Project One",
      repoPath: "/tmp/project-one",
      status: "idle",
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z"
    },
    {
      id: "proj-2",
      name: "Project Two",
      repoPath: "/tmp/project-two",
      status: "idle",
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

    await wrapper.findAll("button")[1]?.trigger("click");
    expect(wrapper.emitted("select")).toEqual([["proj-2"]]);
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
    expect(nav.classes()).toContain("h-10");
    expect(tabList.classes()).toContain("items-center");
    expect(tabList.classes()).toContain("h-full");
    expect(actionCluster?.className).toContain("self-center");
  });

  it("shows attention ring on tabs whose project ids are in projectIdsNeedingAttention", () => {
    const wrapper = mount(ProjectTabs, {
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1",
        projectIdsNeedingAttention: new Set(["proj-2"])
      }
    });
    const attentive = wrapper.get('[data-project-id="proj-2"]').classes();
    expect(attentive).toEqual(expect.arrayContaining(["ring-2", "ring-blue-600"]));
    const calm = wrapper.get('[data-project-id="proj-1"]').classes();
    expect(calm.includes("ring-2")).toBe(false);
  });

  it("hover tooltip lists only threads that need attention", async () => {
    const threads: Thread[] = [
      {
        id: "t1",
        projectId: "proj-1",
        worktreeId: "w1",
        title: "Quiet thread",
        agent: "claude",
        sortOrder: 0,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      },
      {
        id: "t2",
        projectId: "proj-1",
        worktreeId: "w1",
        title: "Noisy thread",
        agent: "codex",
        sortOrder: 1,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      },
      {
        id: "t3",
        projectId: "proj-2",
        worktreeId: "w2",
        title: "Other project thread",
        agent: "claude",
        sortOrder: 0,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      }
    ];
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1",
        threads,
        threadIdsNeedingAttention: new Set(["t2"])
      }
    });
    await wrapper.get('[data-project-id="proj-1"]').trigger("mouseenter");
    await nextTick();
    const tip = document.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toContain("Needs attention");
    expect(tip?.textContent).toMatch(/\(1\)/);
    expect(tip?.textContent).toContain("Noisy thread");
    expect(tip?.textContent).not.toContain("Quiet thread");
    expect(tip?.textContent).not.toContain("Other project thread");
    wrapper.unmount();
  });

  it("hover tooltip shows attention count when multiple threads need attention", async () => {
    const threads: Thread[] = [
      {
        id: "t1",
        projectId: "proj-1",
        worktreeId: "w1",
        title: "First noisy",
        agent: "claude",
        sortOrder: 0,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      },
      {
        id: "t2",
        projectId: "proj-1",
        worktreeId: "w1",
        title: "Second noisy",
        agent: "codex",
        sortOrder: 1,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      }
    ];
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1",
        threads,
        threadIdsNeedingAttention: new Set(["t1", "t2"])
      }
    });
    await wrapper.get('[data-project-id="proj-1"]').trigger("mouseenter");
    await nextTick();
    const tip = document.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toMatch(/\(2\)/);
    expect(tip?.textContent).toContain("First noisy");
    expect(tip?.textContent).toContain("Second noisy");
    wrapper.unmount();
  });

  it("hover tooltip omits thread section when none need attention", async () => {
    const threads: Thread[] = [
      {
        id: "t1",
        projectId: "proj-1",
        worktreeId: "w1",
        title: "Only thread",
        agent: "claude",
        sortOrder: 0,
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z"
      }
    ];
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects,
        worktrees: [],
        activeProjectId: "proj-1",
        threads,
        threadIdsNeedingAttention: new Set()
      }
    });
    await wrapper.get('[data-project-id="proj-1"]').trigger("mouseenter");
    await nextTick();
    const tip = document.querySelector('[role="tooltip"]');
    expect(tip?.textContent).not.toContain("Needs attention");
    expect(tip?.textContent).not.toContain("Only thread");
    wrapper.unmount();
  });
});
