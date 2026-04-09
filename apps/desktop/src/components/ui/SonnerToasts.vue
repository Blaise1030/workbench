<script setup lang="ts">
import { onMounted } from "vue";
import { hydratePersistedToasts } from "@/composables/useToast";
import { Toaster } from "@/components/ui/sonner";

onMounted(() => {
  hydratePersistedToasts();
});
</script>

<template>
  <Toaster />
</template>
