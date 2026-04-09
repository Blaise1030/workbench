<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import { buttonSizeClassMap } from "@/components/ui/button";

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
  /** Shown as native tooltip (keyboard shortcut). */
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
  }>(),
  { ariaLabel: "Tabs", size: "xs" }
);

const tabTriggerSizeClass = computed(() => buttonSizeClassMap[props.size]);

const tablistPaddingClass = computed(() => (props.size === "xs" ? "py-0.5" : "py-1"));

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
  props.size === "xs" ? "h-4" : props.size === "sm" ? "h-5" : "h-6"
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
    role="tablist"
    data-slot="button-group"
    :aria-label="ariaLabel"
    :class="[
      'flex min-w-0 max-w-full flex-nowrap select-none items-center gap-1 overflow-x-auto overflow-y-hidden px-1.5 [scrollbar-width:thin]',
      tablistPaddingClass
    ]"
  >
    <template v-for="(tab, index) in tabs" :key="tab.value">
      <div class="inline-flex max-w-full shrink-0 items-center gap-0.5">
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
          :title="tab.shortcutHint"
          @click="select(tab.value)"
          @keydown="onTabKeydown($event, index)"
        >
          <span
            v-if="tab.tag"
            class="rounded border border-border bg-background px-1 py-0 text-[10px] font-semibold leading-none text-muted-foreground"
            data-testid="pill-tab-tag"
          >
            {{ tab.tag }}
          </span>
          <span class="min-w-0 truncate">{{ tab.label }}</span>
        </Button>
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
