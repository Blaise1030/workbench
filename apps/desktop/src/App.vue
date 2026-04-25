<script setup lang="ts">
import { RouterView } from "vue-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/globals.css";
import AppContext from "@/app-context/AppContext.vue";
</script>

<template>  
  <TooltipProvider>
    <AppContext mode="desktop">
      <RouterView />
    </AppContext>
    <Toaster />
  </TooltipProvider>
</template>
