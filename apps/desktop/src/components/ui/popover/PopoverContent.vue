<script setup lang="ts">
import type { PopoverContentEmits, PopoverContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  PopoverContent,
  PopoverPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { previewNativeCollisionEl } from "@/composables/previewNativeViewportTop"
import { cn } from "@/lib/utils"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes["class"] }>(),
  {
    align: "center",
    sideOffset: 4,
  },
)
const emits = defineEmits<PopoverContentEmits>()

const delegatedProps = reactiveOmit(props, "class", "collisionBoundary")

const forwarded = useForwardPropsEmits(delegatedProps, emits)

/** Avoid overlapping the native preview `WebContentsView` (invisible mirror in `body`). */
const collisionBoundaryMerged = computed((): Element[] | undefined => {
  const p = props.collisionBoundary
  const list: Element[] = []
  if (Array.isArray(p)) {
    for (const x of p) {
      if (x) list.push(x)
    }
  } else if (p) {
    list.push(p)
  }
  const mirror = previewNativeCollisionEl.value
  if (mirror) list.push(mirror)
  return list.length > 0 ? list : undefined
})
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      data-slot="popover-content"
      v-bind="{ ...$attrs, ...forwarded, collisionBoundary: collisionBoundaryMerged }"
      :class="
        cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 rounded-md border p-4 shadow-md origin-(--reka-popover-content-transform-origin) outline-hidden',
          props.class,
        )
      "
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
