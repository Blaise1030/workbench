<script setup lang="ts">
import { computed } from "vue";
import { CircleAlert, CircleCheck, X } from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import type { ToastRecord } from "@/stores/toastStore";
import { normalizeToastVariant, useToastStore } from "@/stores/toastStore";

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

const isSuccess = computed(() => normalizeToastVariant(props.toast.variant) === "success");
const toastRole = computed(() => (isSuccess.value ? "status" : "alert"));
</script>

<template>
  <div
    class="pointer-events-auto relative w-full max-w-sm rounded-xl border border-border bg-card py-3 pl-4 pr-10 text-sm shadow-md"
    :role="toastRole"
    :aria-labelledby="`toast-title-${toast.id}`"
  >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="absolute top-2 right-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Dismiss notification"
      @click="toastStore.dismiss(toast.id)"
    >
      <span class="sr-only">Dismiss</span>
      <X class="h-4 w-4" aria-hidden="true" stroke-width="2" />
    </Button>
    <div class="flex gap-3">
      <div
        v-if="isSuccess"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-2/15 text-chart-2"
        aria-hidden="true"
      >
        <CircleCheck class="h-4 w-4 stroke-[2]" />
      </div>
      <div
        v-else
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
        aria-hidden="true"
      >
        <CircleAlert class="h-4 w-4 stroke-[2]" />
      </div>
      <div class="min-w-0 flex-1 pt-0.5">
        <p
          :id="`toast-title-${toast.id}`"
          class="font-semibold"
          :class="isSuccess ? 'text-chart-2' : 'text-destructive'"
        >
          {{ toast.title }}
        </p>
        <p
          class="mt-1 leading-relaxed"
          :class="isSuccess ? 'text-foreground/90' : 'text-destructive/95'"
        >
          <template v-for="(seg, idx) in descriptionSegments" :key="idx">
            <code
              v-if="seg.kind === 'code'"
              class="rounded px-1 py-0.5 font-mono text-[0.8125rem]"
              :class="
                isSuccess ? 'bg-chart-2/15 text-chart-2' : 'bg-destructive/10 text-destructive'
              "
            >{{ seg.value }}</code>
            <span v-else>{{ seg.value }}</span>
          </template>
        </p>
      </div>
    </div>
  </div>
</template>
