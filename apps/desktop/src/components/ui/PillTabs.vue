<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Tab trigger height / typography; matches `Button` size tokens used for each pill. */
export type PillTabSize = "xs" | "sm" | "default" | "lg";

export type PillTabItem = {
  value: string;
  label: string;
  /** Optional compact tag rendered before the tab label. */
  tag?: string;
  closable?: boolean;
  /** When true, a vertical rule is drawn after this tab (e.g. before shell tabs). */
  dividerAfter?: boolean;
  /** Keyboard shortcut: shown on the pill and in the native tooltip. */
  shortcutHint?: string;
  /** Extra classes when this tab is selected (e.g. accent border). */
  activeClass?: string;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tabs: readonly PillTabItem[];
    ariaLabel?: string;
    /** Larger values increase hit area and label size (default matches previous fixed `xs` look). */
    size?: PillTabSize;
    /** Full-width segmented control (e.g. sidebar center panel). */
    variant?: "default" | "segmented";
  }>(),
  { ariaLabel: "Tabs", size: "xs", variant: "default" }
);

const isSegmented = computed(() => props.variant === "segmented");

/**
 * Dense pill triggers (narrower than generic `Button` sizes) so tab strips fit toolbars.
 * Keeps radius / icon rules aligned with `buttonSizeClassMap` where it matters.
 */
const pillTabTriggerClassMap: Record<PillTabSize, string> = {
  xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-1.5 text-xs leading-none in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-6 gap-1 rounded-[min(var(--radius-md),12px)] px-2 text-[0.8rem] leading-tight in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  default:
    "h-7 gap-1 rounded-lg px-2 py-0 text-sm leading-tight in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
  lg: "h-8 gap-1 rounded-lg px-2.5 py-0 text-sm leading-tight in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-4"
};

const tabTriggerSizeClass = computed(() => pillTabTriggerClassMap[props.size]);

const tablistPaddingClass = computed(() => (props.size === "xs" ? "py-0.5" : "py-0.5"));

const closeButtonSize = computed(() => {
  switch (props.size) {
    case "lg":
      return "icon" as const;
    case "default":
      return "icon-sm" as const;
    case "sm":
      return "icon-sm" as const;
    default:
      return "icon-xs" as const;
  }
});

const dividerClass = computed(() =>
  props.size === "xs" ? "h-4" : props.size === "sm" ? "h-4" : "h-5"
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  tabClose: [value: string];
}>();

function select(value: string) {
  emit("update:modelValue", value);
}

function onCloseClick(event: MouseEvent, value: string): void {
  event.stopPropagation();
  event.preventDefault();
  emit("tabClose", value);
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
    v-if="isSegmented"
    role="tablist"
    data-slot="button-group"
    :aria-label="ariaLabel"
    class="flex w-full min-w-0 select-none"
  >
    <template v-for="(tab, index) in tabs" :key="tab.value">
      <Tooltip :delay-duration="400">
        <TooltipTrigger as-child>
          <button
            type="button"
            role="tab"
            :aria-selected="modelValue === tab.value"
            :tabindex="modelValue === tab.value ? 0 : -1"
            class="min-w-0 cursor-pointer flex-1 rounded-sm min-h-6 text-center leading-tight font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-[10px]"
            :class="
              modelValue === tab.value
                ? 'bg-card border shadow-xs text-foreground'
                : 'border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
            "
            @click="select(tab.value)"
            @keydown="onTabKeydown($event, index)"
          >
            <span class="flex min-w-0 flex-col items-center justify-center gap-0.5">
              <span class="min-w-0 truncate">{{ tab.label }}</span>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent v-if="tab.shortcutHint" side="bottom">
          {{ tab.shortcutHint }}
        </TooltipContent>
      </Tooltip>
    </template>
  </div>
  <div
    v-else
    role="tablist"
    data-slot="button-group"
    :aria-label="ariaLabel"
    :class="[
      'flex min-w-0 max-w-full shadow-xs flex-nowrap select-none items-center gap-0.5 overflow-x-auto overflow-y-hidden px-1 [scrollbar-width:thin]',
      tablistPaddingClass
    ]"
  >
    <template v-for="(tab, index) in tabs" :key="tab.value">
      <div class="inline-flex max-w-full shrink-0 items-center gap-0.5">
        <Tooltip :delay-duration="400">
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              role="tab"
              :aria-selected="modelValue === tab.value"
              :tabindex="modelValue === tab.value ? 0 : -1"
              class="max-w-full transition-colors focus-visible:ring-offset-1"
              :class="[
                tabTriggerSizeClass,
                modelValue === tab.value
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50',
                modelValue === tab.value ? tab.activeClass : undefined
              ]"
              @click="select(tab.value)"
              @keydown="onTabKeydown($event, index)"
            >
              <span class="flex min-w-0 max-w-full items-center gap-1">
                <span
                  v-if="tab.tag"
                  class="rounded border border-border bg-background px-1 py-0 text-[10px] font-semibold leading-none text-muted-foreground"
                  data-testid="pill-tab-tag"
                >
                  {{ tab.tag }}
                </span>
                <span class="min-w-0 truncate">{{ tab.label }}</span>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent v-if="tab.shortcutHint" side="bottom">
           {{ tab.shortcutHint }}
          </TooltipContent>
        </Tooltip>
        <Button
          v-if="tab.closable"
          type="button"
          variant="ghost"
          :size="closeButtonSize"
          class="shrink-0 rounded-sm p-0 text-muted-foreground hover:bg-background/80 hover:text-foreground"
          :aria-label="`Close ${tab.label}`"
          tabindex="-1"
          @click="onCloseClick($event, tab.value)"
        >
          ×
        </Button>
      </div>
      <span
        v-if="tab.dividerAfter"
        :class="['mx-0.5 w-px shrink-0 self-center bg-border', dividerClass]"
        aria-hidden="true"
      />
    </template>
  </div>
</template>
