<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";
import { badgeVariants, type BadgeVariants } from "@/components/ui/badge/index";

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariant;
  }>(),
  {
    variant: "default"
  }
);

const attrs = useAttrs();

const mergedClassName = computed(() =>
  cn(
    badgeVariants({ variant: props.variant }),
    typeof attrs.class === "string" ? attrs.class : undefined
  )
);
</script>

<template>
  <span
    v-bind="attrs"
    data-slot="badge"
    :data-variant="props.variant"
    :class="mergedClassName"
  >
    <slot />
  </span>
</template>
