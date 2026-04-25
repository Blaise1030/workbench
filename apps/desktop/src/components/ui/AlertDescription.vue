<script setup lang="ts">
import { AlertDescription as AlertDescriptionPrimitive } from "@/components/ui/alert/index";
</script>

<template>
  <AlertDescriptionPrimitive v-bind="$attrs">
    <slot />
  </AlertDescriptionPrimitive>
</template>
