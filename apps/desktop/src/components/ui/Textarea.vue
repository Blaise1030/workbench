<script setup lang="ts">
import { computed, ref, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: "" });

const attrs = useAttrs();
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const mergedClassName = computed(() =>
  cn(
    "flex min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    typeof attrs.class === "string" ? attrs.class : undefined
  )
);

const passthrough = computed(() => {
  const { class: _c, ...rest } = attrs as Record<string, unknown>;
  return rest;
});

function focus(options?: FocusOptions): void {
  textareaRef.value?.focus(options);
}

defineExpose({
  focus,
  element: textareaRef
});
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="model"
    data-slot="textarea"
    :class="mergedClassName"
    v-bind="passthrough"
  />
</template>
