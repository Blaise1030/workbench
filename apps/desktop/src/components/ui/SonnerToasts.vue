<script setup lang="ts">
import { onMounted } from "vue";
import { hydratePersistedToasts } from "@/composables/useToast";
import 'vue-sonner/style.css'
import { Toaster } from "@/components/ui/sonner";


onMounted(() => {
  hydratePersistedToasts();
});
</script>

<template>
  <Toaster />
</template>
