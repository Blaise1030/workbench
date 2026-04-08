<script setup lang="ts">
import { computed, ref, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    type?: HTMLInputElement["type"];
  }>(),
  { type: "text" }
);

const model = defineModel<string>({ default: "" });

const attrs = useAttrs();
const inputRef = ref<HTMLInputElement | null>(null);

const mergedClassName = computed(() =>
  cn(
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    typeof attrs.class === "string" ? attrs.class : undefined
  )
);

const passthrough = computed(() => {
  const { class: _c, type: _t, ...rest } = attrs as Record<string, unknown>;
  return rest;
});

function focus(options?: FocusOptions): void {
  inputRef.value?.focus(options);
}

function select(): void {
  inputRef.value?.select();
}

defineExpose({
  focus,
  select,
  element: inputRef
});
</script>

<template>
  <input
    ref="inputRef"
    v-model="model"
    data-slot="input"
    :type="props.type"
    :class="mergedClassName"
    v-bind="passthrough"
  />
</template>
