<script setup lang="ts">
import { useTerminalSoundSettings } from "@/composables/useTerminalSoundSettings";
import { Volume2 } from "lucide-vue-next";

const { terminalBellSound, terminalBackgroundOutputSound } = useTerminalSoundSettings();
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-2 text-xs text-muted-foreground"
    aria-label="Terminal sound settings"
  >
    <span class="inline-flex items-center gap-1.5 font-medium text-foreground/90">
      <Volume2 class="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      Terminal sounds
    </span>
    <label class="inline-flex cursor-pointer items-center gap-2 select-none">
      <input v-model="terminalBellSound" type="checkbox" class="size-3.5 rounded border-border accent-primary" />
      Bell (<kbd class="rounded bg-muted px-1 font-mono text-[0.65rem]">\a</kbd>)
    </label>
    <label class="inline-flex cursor-pointer items-center gap-2 select-none">
      <input
        v-model="terminalBackgroundOutputSound"
        type="checkbox"
        class="size-3.5 rounded border-border accent-primary"
      />
      Background output (once until you view that terminal)
    </label>
  </div>
</template>
