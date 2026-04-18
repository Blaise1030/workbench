import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectTabs from "@/components/ProjectTabs.vue";
import type { Project, Thread } from "@shared/domain";

describe("ProjectTabs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.workspaceApi = {} as WorkspaceApi;
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

  const baseProps = {
    projects,
    worktrees: [],
    activeProjectId: "proj-1",
    collapsed: false
  };

  async function openProjectMenu(): Promise<void> {
    const trigger = document.querySelector('[data-testid="project-switcher-trigger"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    await trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  }

  it("emits select when choosing another project from the menu", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: baseProps
    });

    await openProjectMenu();
    const item = document.querySelector('[data-testid="project-menu-item-proj-2"]') as HTMLElement | null;
    expect(item).toBeTruthy();
    await item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("select")).toEqual([["proj-2"]]);
    wrapper.unmount();
  });

  it("adds attention ring classes on the menu item when a thread in that project needs idle attention", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        ...baseProps,
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
        ] as Thread[],
        idleAttentionByThreadId: { t1: true },
        runStatusByThreadId: {}
      }
    });

    await openProjectMenu();
    const el = document.querySelector('[data-testid="project-menu-item-proj-2"]');
    expect(el).toBeTruthy();
    expect(el!.className.includes("ring-blue")).toBe(true);
    expect(el!.className.includes("bg-blue-500/12")).toBe(true);
    wrapper.unmount();
  });

  it("emits create when Add project is chosen", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: baseProps
    });

    await openProjectMenu();
    const add = document.querySelector('[data-testid="project-menu-add"]') as HTMLElement | null;
    expect(add).toBeTruthy();
    await add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("create")).toHaveLength(1);
    wrapper.unmount();
  });

  it("emits remove for the current project from the destructive menu row without selecting", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: baseProps
    });

    await openProjectMenu();
    const removeBtn = document.querySelector('[data-testid="project-menu-remove-current"]') as HTMLElement | null;
    expect(removeBtn).toBeTruthy();
    await removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(wrapper.emitted("remove")).toEqual([["proj-1"]]);
    expect(wrapper.emitted("select")).toBeUndefined();
    wrapper.unmount();
  });

  it("hides remove when only one project exists", async () => {
    const wrapper = mount(ProjectTabs, {
      attachTo: document.body,
      props: {
        projects: [projects[0]!],
        worktrees: [],
        activeProjectId: "proj-1",
        collapsed: false
      }
    });

    await openProjectMenu();
    expect(document.querySelector('[data-testid="project-menu-remove-current"]')).toBeNull();
    wrapper.unmount();
  });

  it("emits configureCommands when settings is clicked", async () => {
    const wrapper = mount(ProjectTabs, {
      props: baseProps
    });
    await wrapper.get('[aria-label="Settings"]').trigger("click");
    expect(wrapper.emitted("configureCommands")).toEqual([[]]);
  });

  it("keeps the nav and action cluster aligned", () => {
    const wrapper = mount(ProjectTabs, {
      props: baseProps
    });

    const nav = wrapper.get('nav[aria-label="Projects"]');
    const actionCluster = wrapper.get('[aria-label="Settings"]').element.parentElement;

    expect(nav.classes()).toContain("items-center");
    expect(actionCluster?.className).toContain("self-center");
  });
});
