import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DiffReviewPanel from "@/components/DiffReviewPanel.vue";

describe("DiffReviewPanel", () => {
  it("renders the sticky toolbar without a top border and with the background token", () => {
    const wrapper = mount(DiffReviewPanel, {
      props: {
        selectedDiff: "No unstaged changes.",
        summaryLabel: null
      }
    });

    const header = wrapper.get("header");
    const topBorderClasses = header.classes().filter((className) => className.startsWith("border-t"));

    expect(header.classes()).toContain("bg-background");
    expect(topBorderClasses).toEqual([]);
  });

  it("renders flatter action buttons in the diff toolbar", () => {
    const wrapper = mount(DiffReviewPanel, {
      props: {
        selectedDiff: "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n",
        summaryLabel: "a.txt"
      }
    });

    const buttons = wrapper.findAll("button");
    const [stageAll, discardAll] = buttons;

    expect(stageAll).toBeTruthy();
    expect(discardAll).toBeTruthy();
    expect(stageAll!.classes()).toContain("border-0");
    expect(stageAll!.classes()).toContain("shadow-none");
    expect(discardAll!.classes()).toContain("border-0");
    expect(discardAll!.classes()).toContain("shadow-none");
  });
});
