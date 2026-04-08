<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { DialogContent, DialogPortal, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";
import DialogOverlay from "./DialogOverlay.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<
  DialogContentProps & { class?: HTMLAttributes["class"]; overlayClass?: HTMLAttributes["class"] }
>();
const emits = defineEmits<DialogContentEmits>();
const delegatedProps = reactiveOmit(props, "class", "overlayClass");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay :class="props.overlayClass" />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="
        cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[min(100%-2rem,32rem)] max-w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg duration-150 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          props.class
        )
      "
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
