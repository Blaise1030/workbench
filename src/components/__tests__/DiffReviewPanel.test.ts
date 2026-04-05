import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DiffReviewPanel from "@/components/DiffReviewPanel.vue";

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(DiffReviewPanel, {
    props: {
      selectedDiff: "No unstaged changes.",
      summaryLabel: null,
      queuedReviewCount: 0,
      ...overrides,
    },
  });
}

describe("DiffReviewPanel", () => {
  it("renders the sticky toolbar without a top border and with the background token", () => {
    const wrapper = mountPanel({
      selectedDiff: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n",
      summaryLabel: "a.txt",
    });

    const header = wrapper.get("header");
    const topBorderClasses = header.classes().filter((className) => className.startsWith("border-t"));

    expect(header.classes()).toContain("bg-background");
    expect(topBorderClasses).toEqual([]);
  });

  it("shows the queued review count in the sticky header", () => {
    const wrapper = mountPanel({
      selectedDiff: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n",
      summaryLabel: "a.txt",
      queuedReviewCount: 3,
    });

    expect(wrapper.get("header").text()).toContain("3 review items queued");
  });

  it("emits openInAgents from the empty-state action", async () => {
    const wrapper = mountPanel({
      selectedDiff: "No unstaged changes.",
    });

    await wrapper.get('[aria-label="Open in Agents"]').trigger("click");

    expect(wrapper.emitted("openInAgents")).toEqual([[]]);
    expect(wrapper.emitted("goToFirstTab")).toBeUndefined();
  });

  it("emits clearReviewItems from the basket action", async () => {
    const wrapper = mountPanel({
      selectedDiff: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n",
      summaryLabel: "a.txt",
      queuedReviewCount: 2,
    });

    await wrapper.get('[aria-label="Clear review items"]').trigger("click");

    expect(wrapper.emitted("clearReviewItems")).toEqual([[]]);
  });

  it("renders flatter action buttons in the diff toolbar", () => {
    const wrapper = mountPanel({
      selectedDiff: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n",
      summaryLabel: "a.txt",
    });

    const buttons = wrapper.findAll("button");
    const stageAll = buttons.find((button) => button.text().includes("Stage All"));
    const discardAll = buttons.find((button) => button.text().includes("Discard All"));

    expect(stageAll?.classes()).toContain("border-0");
    expect(stageAll?.classes()).toContain("shadow-none");
    expect(discardAll?.classes()).toContain("border-0");
    expect(discardAll?.classes()).toContain("shadow-none");
  });
});
