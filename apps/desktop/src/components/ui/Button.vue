<script setup lang="ts">
import { computed, useAttrs } from "vue";
import {
  buttonClass,
  defaultButtonSize,
  defaultButtonVariant,
  type ButtonSize,
  type ButtonVariant
} from "@/components/ui/button";

type NativeButtonType = "button" | "submit" | "reset";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: NativeButtonType;
    disabled?: boolean;
  }>(),
  {
    variant: defaultButtonVariant,
    size: defaultButtonSize,
    type: "button",
    disabled: false
  }
);

const attrs = useAttrs();

const mergedClassName = computed(() => {
  return buttonClass({
    variant: props.variant,
    size: props.size,
    className: typeof attrs.class === "string" ? attrs.class : undefined
  });
});
</script>

<template>
  <button
    v-bind="attrs"
    data-slot="button"
    :data-variant="props.variant"
    :data-size="props.size"
    :type="props.type"
    :disabled="props.disabled"
    :class="mergedClassName"
  >
    <slot />
  </button>
</template>
