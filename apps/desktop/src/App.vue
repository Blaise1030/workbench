<script setup lang="ts">
import { RouterView } from "vue-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/globals.css";
</script>

<template>
  <TooltipProvider>
    <RouterView />
    <Toaster />
  </TooltipProvider>
</template>
