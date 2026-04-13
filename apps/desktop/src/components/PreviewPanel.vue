<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <!-- URL bar -->
    <div class="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1">
      <input
        v-model="urlInput"
        data-testid="preview-url-input"
        class="min-w-0 flex-1 rounded bg-transparent px-2 py-0.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-border"
        placeholder="http://localhost:3000"
        spellcheck="false"
        @keydown.enter="navigate"
      />
      <button
        data-testid="preview-reload-btn"
        class="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Reload"
        @click="reload"
      >
        <RotateCw class="h-3.5 w-3.5" />
      </button>
    </div>
    <!-- Placeholder div — native WebContentsView is positioned over this by the main process -->
    <div ref="viewportRef" data-testid="preview-viewport" class="min-h-0 flex-1" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { RotateCw } from "lucide-vue-next";

const urlInput = ref("http://localhost:3000");
const viewportRef = ref<HTMLDivElement | null>(null);

function getApi(): Window["previewApi"] {
  return window.previewApi;
}

/** Accept bare port ("3000") or host-only ("localhost:3000") and make it a full URL. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return `http://localhost:${s}`;
  if (!s.startsWith("http://") && !s.startsWith("https://")) return `http://${s}`;
  return s;
}

function sendBounds(): void {
  const el = viewportRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  void getApi()?.setBounds({
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  });
}

function navigate(): void {
  const url = normalizeUrl(urlInput.value);
  urlInput.value = url;
  void getApi()?.setUrl(url);
}

function reload(): void {
  void getApi()?.reload();
}

let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await getApi()?.show();
  sendBounds();
  resizeObserver = new ResizeObserver(sendBounds);
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  void getApi()?.hide();
});
</script>
