<script setup lang="ts">
import { AlertTitle as AlertTitlePrimitive } from "@/components/ui/alert/index";
</script>

<template>
  <AlertTitlePrimitive v-bind="$attrs">
    <slot />
  </AlertTitlePrimitive>
</template>
