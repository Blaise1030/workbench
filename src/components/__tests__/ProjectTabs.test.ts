import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ProjectTabs from "@/components/ProjectTabs.vue";
import type { Project } from "@shared/domain";

describe("ProjectTabs", () => {
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
});
