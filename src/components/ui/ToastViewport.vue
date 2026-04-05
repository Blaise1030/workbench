<script setup lang="ts">
import { storeToRefs } from "pinia";
import ToastItem from "@/components/ui/ToastItem.vue";
import { useToastStore } from "@/stores/toastStore";

const toastStore = useToastStore();
const { items } = storeToRefs(toastStore);
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed top-6 left-1/2 z-[200] flex w-[min(100%-2rem,24rem)] -translate-x-1/2 flex-col items-center gap-3"
      aria-live="assertive"
      aria-relevant="additions"
    >
      <ToastItem v-for="t in items" :key="t.id" :toast="t" />
    </div>
  </Teleport>
</template>
