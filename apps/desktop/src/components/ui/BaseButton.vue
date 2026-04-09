<script setup lang="ts">
import Button from "@/components/ui/Button.vue";
import {
  defaultButtonSize,
  defaultButtonVariant,
  type ButtonSize,
  type ButtonVariant
} from "@/components/ui/button";

type NativeButtonType = "button" | "submit" | "reset";

withDefaults(
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
</script>

<template>
  <Button v-bind="{ ...$props, ...$attrs }">
    <slot />
  </Button>
</template>
