<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { alertTitleClass } from "@/components/ui/alert";

const attrs = useAttrs();

const mergedClassName = computed(() =>
  [alertTitleClass, typeof attrs.class === "string" ? attrs.class : undefined].filter(Boolean).join(" ")
);
</script>

<template>
  <div v-bind="attrs" data-slot="alert-title" :class="mergedClassName">
    <slot />
  </div>
</template>
