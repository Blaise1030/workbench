import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import WorktreeSwitcher from "@/components/WorktreeSwitcher.vue";
import type { Worktree } from "@shared/domain";

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

const worktrees: Worktree[] = [
  {
    id: "w-main",
    projectId: "p1",
    name: "main",
    branch: "main",
    path: "/tmp/project",
    isActive: true,
    isDefault: true,
    baseBranch: null,
    lastActiveThreadId: null,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z"
  },
  {
    id: "w-feat",
    projectId: "p1",
    name: "feat/auth",
    branch: "feat/auth",
    path: "/tmp/project/.worktrees/feat-auth",
    isActive: false,
    isDefault: false,
    baseBranch: "main",
    lastActiveThreadId: null,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z"
  }
];

describe("WorktreeSwitcher", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a shadcn select trigger with the active branch label", () => {
    const wrapper = mount(WorktreeSwitcher, {
      attachTo: document.body,
      props: {
        worktrees,
        activeWorktreeId: "w-main"
      }
    });

    const trigger = wrapper.get('[data-slot="select-trigger"]');
    expect(trigger.text()).toContain("main");
  });

  it("keeps the trigger wired for shadcn select interactions", async () => {
    const wrapper = mount(WorktreeSwitcher, {
      attachTo: document.body,
      props: {
        worktrees,
        activeWorktreeId: "w-main"
      }
    });

    const trigger = wrapper.get('[data-slot="select-trigger"]');
    await trigger.trigger("pointerdown", {
      button: 0,
      ctrlKey: false
    });
    await nextTick();

    expect(trigger.attributes("aria-expanded")).toBe("true");
  });
});
