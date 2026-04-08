<script setup lang="ts">
import { computed } from "vue";
import { Laptop, Moon, Sun } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { useColorScheme, type ColorSchemePreference } from "@/composables/useColorScheme";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
  }>(),
  { variant: "outline", size: "icon-xs" }
);

const { preference, cycle } = useColorScheme();

const label = computed(() => {
  const map: Record<ColorSchemePreference, string> = {
    light: "Light theme",
    dark: "Dark theme",
    system: "Match system"
  };
  return map[preference.value];
});

const title = computed(() => `${label.value} (click to change)`);
</script>

<template>
  <Button
    type="button"
    :variant="props.variant"
    :size="props.size"
    :aria-label="title"
    :title="title"
    @click="cycle"
  >
    <Sun v-if="preference === 'light'" class="h-3.5 w-3.5" aria-hidden="true" />
    <Moon v-else-if="preference === 'dark'" class="h-3.5 w-3.5" aria-hidden="true" />
    <Laptop v-else class="h-3.5 w-3.5" aria-hidden="true" />
  </Button>
</template>
