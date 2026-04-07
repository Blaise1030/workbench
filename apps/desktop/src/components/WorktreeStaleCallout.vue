<script setup lang="ts">
import { AlertTriangle } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";

defineProps<{
  branch: string;
}>();

const emit = defineEmits<{
  delete: [];
}>();
</script>

<template>
  <div class="mx-2 my-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5">
    <div class="flex items-start gap-2">
      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div class="min-w-0 flex-1 space-y-1.5">
        <p
          data-testid="worktree-stale-message"
          class="text-[11px] leading-4 text-foreground/90"
        >
          The worktree for <span class="font-medium text-emerald-500">{{ branch }}</span>
          was removed outside the app.
        </p>
        <div class="flex">
          <BaseButton
            data-testid="worktree-stale-delete"
            type="button"
            variant="destructive"
            size="xs"
            @click="emit('delete')"
          >
            Delete group &amp; threads
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
