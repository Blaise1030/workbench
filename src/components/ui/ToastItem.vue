<script setup lang="ts">
import { computed } from "vue";
import { CircleAlert, X } from "lucide-vue-next";
import type { ToastRecord } from "@/stores/toastStore";
import { useToastStore } from "@/stores/toastStore";

const props = defineProps<{
  toast: ToastRecord;
}>();

const toastStore = useToastStore();

type Segment = { kind: "text" | "code"; value: string };

function splitInlineCode(text: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > i) out.push({ kind: "text", value: text.slice(i, m.index) });
    out.push({ kind: "code", value: m[1] ?? "" });
    i = m.index + m[0].length;
  }
  if (i < text.length) out.push({ kind: "text", value: text.slice(i) });
  return out.length ? out : [{ kind: "text", value: text }];
}

const descriptionSegments = computed(() => splitInlineCode(props.toast.description));
</script>

<template>
  <div
    class="pointer-events-auto relative w-full max-w-sm rounded-xl border border-border bg-card py-3 pl-4 pr-10 text-sm shadow-md"
    role="alert"
    :aria-labelledby="`toast-title-${toast.id}`"
  >
    <button
      type="button"
      class="absolute top-2 right-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Dismiss notification"
      @click="toastStore.dismiss(toast.id)"
    >
      <span class="sr-only">Dismiss</span>
      <X class="h-4 w-4" aria-hidden="true" stroke-width="2" />
    </button>
    <div class="flex gap-3">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
        aria-hidden="true"
      >
        <CircleAlert class="h-4 w-4 stroke-[2]" />
      </div>
      <div class="min-w-0 flex-1 pt-0.5">
        <p :id="`toast-title-${toast.id}`" class="font-semibold text-destructive">
          {{ toast.title }}
        </p>
        <p class="mt-1 text-destructive/95 leading-relaxed">
          <template v-for="(seg, idx) in descriptionSegments" :key="idx">
            <code
              v-if="seg.kind === 'code'"
              class="rounded bg-destructive/10 px-1 py-0.5 font-mono text-[0.8125rem] text-destructive"
            >{{ seg.value }}</code>
            <span v-else>{{ seg.value }}</span>
          </template>
        </p>
      </div>
    </div>
  </div>
</template>
