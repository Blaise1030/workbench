<script setup lang="ts">
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";

const filePath = ref("src/App.vue");
const content = ref("");

const emit = defineEmits<{
  apply: [filePath: string, content: string];
}>();
</script>

<template>
  <section class="border-t border-border p-3">
    <header class="mb-2">
      <h3 class="text-sm font-semibold">Quick Edit</h3>
    </header>
    <form @submit.prevent="emit('apply', filePath, content)">
      <label class="mb-1 block text-xs text-muted-foreground">File</label>
      <input v-model="filePath" class="mb-2 w-full rounded-md border border-input px-2 py-1 text-xs" />
      <label class="mb-1 block text-xs text-muted-foreground">Content</label>
      <textarea v-model="content" class="h-20 w-full rounded-md border border-input px-2 py-1 text-xs"></textarea>
      <Button type="submit" size="sm" class="mt-2">Apply Patch</Button>
    </form>
  </section>
</template>
