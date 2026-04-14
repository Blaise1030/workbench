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
  it("does not render Suggest when suggestCommitAvailable is false", () => {
    const wrapper = mount(SourceControlPanel, {
      shallow: true,
      props: {
        ...baseProps,
        suggestCommitAvailable: false
      }
    });
    expect(wrapper.find('[data-testid="scm-suggest-commit"]').exists()).toBe(false);
  });

  it("renders Suggest when available and WebGPU is ok", () => {
    const wrapper = mount(SourceControlPanel, {
      shallow: true,
      props: {
        ...baseProps,
        suggestCommitAvailable: true,
        suggestCommitGpuOk: true
      }
    });
    expect(wrapper.find('[data-testid="scm-suggest-commit"]').exists()).toBe(true);
  });
});
