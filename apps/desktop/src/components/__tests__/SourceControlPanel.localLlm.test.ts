import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/MonacoDiffEditor.vue", () => ({
  default: { name: "MonacoDiffEditorStub", template: "<div />" }
}));

import SourceControlPanel from "@/components/SourceControlPanel.vue";

const baseProps = {
  repoStatus: [] as const,
  selectedPath: null,
  selectedScope: null as "staged" | "unstaged" | null,
  mergeResult: null,
  mergeLoading: false
};

describe("SourceControlPanel local LLM controls", () => {
  it("does not render Suggest when feature flag is off", () => {
    const wrapper = mount(SourceControlPanel, {
      shallow: true,
      props: {
        ...baseProps,
        suggestCommitAvailable: false
      }
    });
    expect(wrapper.find('[data-testid="scm-suggest-commit"]').exists()).toBe(false);
  });

  it("still does not render Suggest even when available and WebGPU is ok", () => {
    const wrapper = mount(SourceControlPanel, {
      shallow: true,
      props: {
        ...baseProps,
        suggestCommitAvailable: true,
        suggestCommitGpuOk: true
      }
    });
    expect(wrapper.find('[data-testid="scm-suggest-commit"]').exists()).toBe(false);
  });

  it("renders thread sidebar expand control when requested", () => {
    const wrapper = mount(SourceControlPanel, {
      shallow: true,
      props: {
        ...baseProps,
        showThreadSidebarExpand: true
      }
    });
    expect(wrapper.find('[data-testid="scm-thread-sidebar-expand"]').exists()).toBe(true);
  });

  it("emits expandThreadSidebar from the header control", async () => {
    const wrapper = mount(SourceControlPanel, {
      shallow: true,
      props: {
        ...baseProps,
        showThreadSidebarExpand: true
      }
    });
    await wrapper.get('[data-testid="scm-thread-sidebar-expand"]').trigger("click");
    expect(wrapper.emitted("expandThreadSidebar")).toEqual([[]]);
  });
});
