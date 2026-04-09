<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { storeToRefs } from "pinia";
import { Toaster, toast } from "vue-sonner";
import { normalizeToastVariant, useToastStore } from "@/stores/toastStore";

const toastStore = useToastStore();
toastStore.hydratePersisted();
const { items } = storeToRefs(toastStore);

const activeToastIds = new Set<string>();

watch(
  items,
  (nextItems) => {
    const nextIds = new Set(nextItems.map((item) => item.id));

    for (const item of nextItems) {
      if (activeToastIds.has(item.id)) continue;

      activeToastIds.add(item.id);
      const show = normalizeToastVariant(item.variant) === "success" ? toast.success : toast.error;

      show(item.title, {
        id: item.id,
        description: item.description,
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        onDismiss: () => {
          toastStore.dismiss(item.id);
        }
      });
    }

    for (const id of Array.from(activeToastIds)) {
      if (nextIds.has(id)) continue;
      toast.dismiss(id);
      activeToastIds.delete(id);
    }
  },
  { immediate: true, deep: true }
);

onBeforeUnmount(() => {
  for (const id of Array.from(activeToastIds)) {
    toast.dismiss(id);
  }
  activeToastIds.clear();
});
</script>

<template>
  <Toaster
    position="top-center"
    rich-colors
    expand
    :toast-options="{
      class: 'text-sm'
    }"
  />
</template>
