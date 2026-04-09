<script setup lang="ts">
import { useColorMode } from "@vueuse/core";
import { Toaster as Sonner } from "vue-sonner";

const mode = useColorMode();
</script>

<template>
  <Sonner
    :theme="(mode as 'light' | 'dark')"
    class="toaster group"
    :toast-options="{
      classes: {
        toast:
          'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
      }
    }"
  />
</template>
