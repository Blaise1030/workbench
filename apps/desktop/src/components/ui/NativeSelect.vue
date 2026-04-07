<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    size?: "sm" | "default";
  }>(),
  { size: "default" }
);

const model = defineModel<string>({ default: "" });

const attrs = useAttrs();

const wrapperClassName = computed(() =>
  cn(
    "group/native-select relative w-full has-[select:disabled]:opacity-50",
    typeof attrs.class === "string" ? attrs.class : undefined
  )
);

const selectClassName = computed(() =>
  cn(
    "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
  )
);

const selectAttrs = computed(() => {
  const { class: _c, ...rest } = attrs as Record<string, unknown>;
  return rest;
});
</script>

<template>
  <div
    data-slot="native-select-wrapper"
    :data-size="props.size"
    :class="wrapperClassName"
  >
    <select
      v-model="model"
      data-slot="native-select"
      :data-size="props.size"
      :class="selectClassName"
      v-bind="selectAttrs"
    >
      <slot />
    </select>
    <ChevronDown
      class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
      aria-hidden="true"
      data-slot="native-select-icon"
    />
  </div>
</template>
