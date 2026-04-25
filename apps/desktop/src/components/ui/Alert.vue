<script setup lang="ts">
import { Alert as AlertPrimitive } from "@/components/ui/alert/index";
</script>

<template>
  <AlertPrimitive v-bind="$attrs">
    <slot />
  </AlertPrimitive>
</template>
