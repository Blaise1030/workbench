<script setup lang="ts">
import { toRaw } from "vue";
import { storeToRefs } from "pinia";
import ToastItem from "@/components/ui/ToastItem.vue";
import { normalizeToastVariant, useToastStore, type ToastRecord } from "@/stores/toastStore";

const toastStore = useToastStore();
const { items } = storeToRefs(toastStore);

/** Plain snapshot so ToastItem always sees a real `variant` (Pinia proxies can confuse prop reads). */
function snapshotToast(t: ToastRecord): ToastRecord {
  const raw = toRaw(t);
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    variant: normalizeToastVariant(raw.variant)
  };
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed top-6 left-1/2 z-[200] flex w-[min(100%-2rem,24rem)] -translate-x-1/2 flex-col items-center gap-3"
      aria-live="assertive"
      aria-relevant="additions"
    >
      <ToastItem v-for="t in items" :key="t.id" :toast="snapshotToast(t)" />
    </div>
  </Teleport>
</template>
