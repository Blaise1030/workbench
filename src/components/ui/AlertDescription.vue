<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { alertDescriptionClass } from "@/components/ui/alert";

const attrs = useAttrs();

const mergedClassName = computed(() =>
  [alertDescriptionClass, typeof attrs.class === "string" ? attrs.class : undefined].filter(Boolean).join(" ")
);
</script>

<template>
  <div v-bind="attrs" data-slot="alert-description" :class="mergedClassName">
    <slot />
  </div>
</template>
