<script setup lang="ts">
import { buttonSizeClassMap } from "@/components/ui/button";

export type PillTabItem = { value: string; label: string };

/** Matches `buttonSizeClassMap.xs` — shared tab trigger metrics with BaseButton `size="xs"`. */
const tabTriggerSizeClass = buttonSizeClassMap.xs;

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tabs: readonly PillTabItem[];
    ariaLabel?: string;
  }>(),
  { ariaLabel: "Tabs" }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function select(value: string) {
  emit("update:modelValue", value);
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  const { key } = event;
  if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
  event.preventDefault();
  const n = props.tabs.length;
  if (n === 0) return;
  let next = index;
  if (key === "ArrowRight") next = (index + 1) % n;
  else if (key === "ArrowLeft") next = (index - 1 + n) % n;
  else if (key === "Home") next = 0;
  else next = n - 1;
  emit("update:modelValue", props.tabs[next].value);
}
</script>

<template>
  <div
    role="tablist"
    data-slot="button-group"
    :aria-label="ariaLabel"
    class="flex items-center gap-1 px-1.5 py-1"
  >
    <button
      v-for="(tab, index) in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      :tabindex="modelValue === tab.value ? 0 : -1"
      class="inline-flex shrink-0 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      :class="[
        tabTriggerSizeClass,
        modelValue === tab.value
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50'
      ]"
      @click="select(tab.value)"
      @keydown="onTabKeydown($event, index)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
