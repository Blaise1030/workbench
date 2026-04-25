import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("renders the bound model value", () => {
    const wrapper = mount(Textarea, {
      props: {
        modelValue: "Initial draft"
      }
    });

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Initial draft");
  });

  it("emits update:modelValue when edited", async () => {
    const wrapper = mount(Textarea, {
      props: {
        modelValue: ""
      }
    });

    await wrapper.get("textarea").setValue("Updated draft");

    expect(wrapper.emitted("update:modelValue")).toEqual([["Updated draft"]]);
  });

  it("forwards attributes and compact classes", () => {
    const wrapper = mount(Textarea, {
      attrs: {
        "aria-label": "Draft",
        class: "min-h-28 font-mono text-xs"
      }
    });

    const textarea = wrapper.get("textarea");
    expect(textarea.attributes("aria-label")).toBe("Draft");
    expect(textarea.classes()).toContain("rounded-lg");
    expect(textarea.classes()).toContain("border");
    expect(textarea.classes()).toContain("font-mono");
    expect(textarea.classes()).toContain("min-h-28");
  });
});
