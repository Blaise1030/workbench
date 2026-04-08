import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";

describe("ThreadGroupHeader", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a branch badge before the title for the primary group when branch is set", () => {
    const wrapper = mount(ThreadGroupHeader, {
      props: {
        title: "Primary",
        branch: "main",
        threadCount: 9,
        isStale: false,
        collapsed: false,
        isActive: true,
        isPrimary: true,
        showActions: false
      }
    });

    expect(wrapper.get('[data-testid="thread-group-context-badge"]').text()).toBe("main");
    expect(wrapper.get('[data-testid="thread-group-primary-context-badge"]').text()).toBe("Primary");
  });

  it("renders the primary context badge from contextBadgeLabel when provided", () => {
    const wrapper = mount(ThreadGroupHeader, {
      props: {
        title: "Primary",
        contextBadgeLabel: "feature/checkout",
        threadCount: 3,
        isStale: false,
        collapsed: false,
        isActive: true,
        isPrimary: true,
        showActions: false
      }
    });

    expect(wrapper.get('[data-testid="thread-group-primary-context-badge"]').text()).toBe(
      "feature/checkout"
    );
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
