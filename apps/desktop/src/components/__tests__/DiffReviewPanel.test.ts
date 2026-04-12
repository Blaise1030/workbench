import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
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
  beforeEach(() => {
    setActivePinia(createPinia());
  });

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
    const stageSelected = buttons.find((button) => button.text().includes("Stage selected"));
    const discardSelected = buttons.find((button) => button.text().includes("Discard selected"));

    expect(stageSelected?.classes()).toContain("border-0");
    expect(stageSelected?.classes()).toContain("shadow-none");
    expect(discardSelected?.classes()).toContain("border-0");
    expect(discardSelected?.classes()).toContain("shadow-none");
  });

  it("lists changed files with checkboxes and emits only checked paths for stage", async () => {
    const diff =
      "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n" +
      "diff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-x\n+y\n";
    const wrapper = mountPanel({
      selectedDiff: diff,
      summaryLabel: "2 files",
    });

    expect(wrapper.get('[data-testid="diff-file-selection"]').text()).toContain("a.txt");
    expect(wrapper.get('[data-testid="diff-file-selection"]').text()).toContain("b.txt");

    const rowCheckboxes = wrapper.findAll('ul input[type="checkbox"]');
    expect(rowCheckboxes).toHaveLength(2);
    await rowCheckboxes[0]!.setValue(false);

    const stageBtn = wrapper.findAll("button").find((b) => b.text().includes("Stage selected"));
    await stageBtn!.trigger("click");

    expect(wrapper.emitted("stageSelected")).toEqual([[["b.txt"]]]);
  });
});
