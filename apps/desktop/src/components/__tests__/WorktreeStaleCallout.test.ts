import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorktreeStaleCallout from "@/components/WorktreeStaleCallout.vue";

describe("WorktreeStaleCallout", () => {
  it("renders smaller text with only the delete action", async () => {
    const wrapper = mount(WorktreeStaleCallout, {
      props: {
        branch: "chore/pnpm-workspace-impl"
      }
    });

    const message = wrapper.get('[data-testid="worktree-stale-message"]');
    const deleteButton = wrapper.get('[data-testid="worktree-stale-delete"]');

    expect(message.classes()).toContain("text-[11px]");
    expect(message.text()).toContain("The worktree for");
    expect(message.text()).toContain("chore/pnpm-workspace-impl");
    expect(wrapper.text()).not.toContain("Keep group");
    expect(deleteButton.text()).toContain("Delete group & threads");

    await deleteButton.trigger("click");

    expect(wrapper.emitted("delete")).toEqual([[]]);
  });
});
