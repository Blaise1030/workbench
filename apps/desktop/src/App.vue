<script setup lang="ts">
import SonnerToasts from "@/components/ui/SonnerToasts.vue";
import { TooltipProvider } from "@/components/ui/tooltip";
import WorkspaceLayout from "@/layouts/WorkspaceLayout.vue";
</script>

<template>
    <TooltipProvider>
      <WorkspaceLayout />
      <SonnerToasts />    
    </TooltipProvider>    
</template>
