import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BaseButton from "@/components/ui/BaseButton.vue";
import { buttonClass, buttonSizeClassMap, buttonVariantClassMap } from "@/components/ui/button";

function expectClassTokens(classes: string[], classNames: string): void {
  for (const className of classNames.split(" ")) {
    expect(classes).toContain(className);
  }
}

describe("BaseButton", () => {
  it("applies default variant and size classes", () => {
    const wrapper = mount(BaseButton, {
      slots: { default: "Click me" }
    });

    const button = wrapper.get("button");
    expect(button.classes()).toContain("inline-flex");
    expectClassTokens(button.classes(), buttonVariantClassMap.default);
    expectClassTokens(button.classes(), buttonSizeClassMap.default);
    expect(button.attributes("type")).toBe("button");
    expect(button.attributes("data-slot")).toBe("button");
    expect(button.attributes("data-variant")).toBe("default");
    expect(button.attributes("data-size")).toBe("default");
  });

  it("maps primary variant to default styles", () => {
    const primary = mount(BaseButton, { props: { variant: "primary" }, slots: { default: "x" } });
    const explicit = mount(BaseButton, { props: { variant: "default" }, slots: { default: "x" } });
    expect(primary.get("button").classes().sort()).toEqual(explicit.get("button").classes().sort());
  });

  it("maps md size to default styles", () => {
    const md = mount(BaseButton, { props: { size: "md" }, slots: { default: "x" } });
    const def = mount(BaseButton, { props: { size: "default" }, slots: { default: "x" } });
    expect(md.get("button").classes().sort()).toEqual(def.get("button").classes().sort());
  });

  it("applies variant classes", () => {
    const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

    for (const variant of variants) {
      const wrapper = mount(BaseButton, {
        props: { variant },
        slots: { default: variant }
      });
      expectClassTokens(wrapper.get("button").classes(), buttonVariantClassMap[variant]);
    }
  });

  it("applies size classes", () => {
    const sizes = ["xs", "sm", "default", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const;

    for (const size of sizes) {
      const wrapper = mount(BaseButton, {
        props: { size },
        slots: { default: size }
      });
      expectClassTokens(wrapper.get("button").classes(), buttonSizeClassMap[size]);
    }
  });

  it("forwards native attributes", () => {
    const wrapper = mount(BaseButton, {
      attrs: {
        "aria-label": "Save",
        "data-testid": "save-btn"
      },
      props: {
        disabled: true,
        type: "submit"
      },
      slots: { default: "Save" }
    });

    const button = wrapper.get("button");
    expect(button.attributes("aria-label")).toBe("Save");
    expect(button.attributes("data-testid")).toBe("save-btn");
    expect(button.attributes("type")).toBe("submit");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("emits click event", async () => {
    const wrapper = mount(BaseButton, {
      slots: { default: "Save" }
    });

    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });

  it("matches buttonClass helper output", () => {
    const wrapper = mount(BaseButton, {
      props: { variant: "outline", size: "sm" },
      slots: { default: "Ok" }
    });
    const fromHelper = buttonClass({ variant: "outline", size: "sm" }).split(/\s+/).filter(Boolean);
    const onEl = wrapper.get("button").classes();
    for (const token of fromHelper) {
      expect(onEl).toContain(token);
    }
  });
});
