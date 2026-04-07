<script setup lang="ts">
import logoUrl from "@/assets/workbench-logo.png";

withDefaults(
  defineProps<{
    /** Collapsed rail vs expanded header */
    variant?: "sm" | "md";
  }>(),
  { variant: "md" }
);
</script>

<template>
  <img
    :src="logoUrl"
    alt=""
    loading="eager"
    decoding="async"
    :class="[
      'pointer-events-none shrink-0 select-none rounded-lg object-cover',
      variant === 'sm' ? 'size-6' : 'size-8'
    ]"
    draggable="false"
    aria-hidden="true"
    data-testid="thread-sidebar-logo"
  />
</template>
