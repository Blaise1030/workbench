<script setup lang="ts">
import { computed, useId } from "vue";

const props = withDefaults(
  defineProps<{
    /** Collapsed rail vs expanded header */
    variant?: "sm" | "md";
  }>(),
  { variant: "md" }
);

const safeId = useId().replace(/:/g, "_");
const bgGradId = `${safeId}_bg`;
const metalGradId = `${safeId}_metal`;

const sizeClass = computed(() => (props.variant === "sm" ? "size-6" : "size-7"));
</script>

<template>
  <svg
    :class="sizeClass"
    class="shrink-0"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    data-testid="thread-sidebar-logo"
  >
    <defs>
      <linearGradient
        :id="bgGradId"
        x1="50%"
        y1="0%"
        x2="50%"
        y2="100%"
      >
        <stop offset="0%" stop-color="#2e2e33" />
        <stop offset="100%" stop-color="#121214" />
      </linearGradient>
      <linearGradient
        :id="metalGradId"
        x1="50%"
        y1="0%"
        x2="50%"
        y2="100%"
      >
        <stop offset="0%" stop-color="#fafafa" />
        <stop offset="42%" stop-color="#c4c4cc" />
        <stop offset="100%" stop-color="#5c5c66" />
      </linearGradient>
    </defs>
    <rect
      x="1"
      y="1"
      width="30"
      height="30"
      rx="7.5"
      :fill="`url(#${bgGradId})`"
      stroke="#d4d4d8"
      stroke-width="0.75"
    />
    <text
      x="16"
      y="16"
      text-anchor="middle"
      dominant-baseline="central"
      class="select-none"
      style="
        font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: -0.02em;
      "
      :fill="`url(#${metalGradId})`"
    >
      In
    </text>
  </svg>
</template>
