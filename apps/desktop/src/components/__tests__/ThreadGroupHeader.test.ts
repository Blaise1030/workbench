import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ThreadGroupHeader from "@/components/ThreadGroupHeader.vue";

describe("ThreadGroupHeader", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

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

    const header = wrapper.get('[data-testid="thread-group-header"]');
    expect(header.attributes("aria-label")).toContain("main");
    expect(header.text()).toContain("Primary");
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

    expect(wrapper.get('[data-testid="thread-group-header"]').text()).toContain("feature/checkout");
  });

  it("emits add-thread-inline with the worktreeId when the + button is clicked", async () => {
    const wrapper = mount(ThreadGroupHeader, {
      attachTo: document.body,
      props: {
        title: "main",
        threadCount: 0,
        isStale: false,
        collapsed: false,
        isActive: true,
        isPrimary: true,
        worktreeIdForCreate: "wt-42"
      }
    });

    await wrapper.get('[aria-label="Add thread to group"]').trigger("click");
    expect(wrapper.emitted("add-thread-inline")).toEqual([["wt-42"]]);
  });

  it("shows add thread in the header even when group menu is hidden (primary)", () => {
    const wrapper = mount(ThreadGroupHeader, {
      props: {
        title: "Primary",
        branch: "main",
        threadCount: 1,
        isStale: false,
        collapsed: false,
        isActive: true,
        isPrimary: true,
        showActions: false,
        worktreeIdForCreate: "wt-default"
      }
    });

    expect(wrapper.find('[aria-label="Add thread to group"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Thread group actions"]').exists()).toBe(false);
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
        isActive: true,
        worktreeIdForCreate: "wt-feat"
      }
    });

    await wrapper.get('[aria-label="Thread group actions"]').trigger("click");

    const content = document.querySelector('[data-slot="dropdown-menu-content"]');
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain("Delete group");
  });
});
