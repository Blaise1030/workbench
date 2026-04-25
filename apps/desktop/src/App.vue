<script setup lang="ts">
import { RouterView } from "vue-router";
import SonnerToasts from "@/components/ui/SonnerToasts.vue";
import { TooltipProvider } from "@/components/ui/tooltip";
</script>

<template>
  <TooltipProvider>
    <RouterView />
    <SonnerToasts />
  </TooltipProvider>
</template>
