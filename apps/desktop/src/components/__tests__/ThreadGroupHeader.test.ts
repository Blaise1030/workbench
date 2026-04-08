import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";

describe("ThreadGroupHeader", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens a shadcn dropdown menu for group actions", async () => {
    const wrapper = mount(ThreadGroupHeader, {
      attachTo: document.body,
      props: {
        title: "feat/auth",
        branch: "feat/auth",
        baseBranch: "main",
        path: "/tmp/project/.worktrees/feat-auth",
        threadCount: 2,
        isStale: false,
        collapsed: false,
        isActive: true
      }
    });

    await wrapper.get('[aria-label="Thread group actions"]').trigger("click");

    const content = document.querySelector('[data-slot="dropdown-menu-content"]');
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain("Delete group");
  });
});
