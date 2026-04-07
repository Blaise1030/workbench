<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { alertClass, defaultAlertVariant, type AlertVariant } from "@/components/ui/alert";

const props = withDefaults(
  defineProps<{
    variant?: AlertVariant;
  }>(),
  {
    variant: defaultAlertVariant
  }
);

const attrs = useAttrs();

const mergedClassName = computed(() =>
  alertClass({
    variant: props.variant,
    className: typeof attrs.class === "string" ? attrs.class : undefined
  })
);
</script>

<template>
  <div
    v-bind="attrs"
    data-slot="alert"
    :data-variant="props.variant"
    :role="props.variant === 'destructive' ? 'alert' : undefined"
    :class="mergedClassName"
  >
    <slot />
  </div>
</template>
