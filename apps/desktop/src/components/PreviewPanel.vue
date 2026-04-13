<template>
  <div ref="panelRootRef" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <!-- URL bar -->
    <div class="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1">
      <input
        v-model="urlInput"
        data-testid="preview-url-input"
        class="min-w-0 flex-1 rounded bg-transparent px-2 py-0.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-border"
        placeholder="Port or URL — Enter to load"
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
      <button
        data-testid="preview-devtools-btn"
        type="button"
        class="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Open preview DevTools (detached)"
        @click="openPreviewDevTools"
      >
        <Bug class="h-3.5 w-3.5" />
      </button>
    </div>
    <!-- Load / HTTP / network outcome (stays above native WebContentsView) -->
    <div
      v-if="loadBanner"
      data-testid="preview-load-banner"
      class="shrink-0 border-b border-border px-2 py-1.5 text-xs leading-snug"
      :class="loadBanner.toneClass"
    >
      {{ loadBanner.text }}
    </div>
    <!-- Placeholder div — native WebContentsView is positioned over this by the main process -->
    <div ref="viewportRef" data-testid="preview-viewport" class="min-h-0 flex-1" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { setPreviewNativeViewportTopPx } from "@/composables/previewNativeViewportTop";
import { Bug, RotateCw } from "lucide-vue-next";
import type { PreviewLoadStatePayload } from "@shared/ipc";
import { loadPreviewPanelUrl, savePreviewPanelUrl } from "@/composables/usePreviewPanelUrlPersistence";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const workspace = useWorkspaceStore();
const urlInput = ref("");
const panelRootRef = ref<HTMLDivElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const loadState = ref<PreviewLoadStatePayload | null>(null);

watch(
  () => workspace.activeWorktreeId,
  (worktreeId) => {
    loadState.value = null;
    urlInput.value = loadPreviewPanelUrl(worktreeId);
  },
  { immediate: true }
);

const loadBanner = computed(() => {
  const s = loadState.value;
  if (!s) return null;
  if (s.kind === "loading") {
    return {
      toneClass: "bg-muted/40 text-muted-foreground",
      text: "Loading…"
    };
  }
  if (s.kind === "loaded") {
    return {
      toneClass: "bg-muted/30 text-muted-foreground",
      text: `Ready · HTTP ${s.statusCode}`
    };
  }
  if (s.kind === "httpError") {
    const line = s.statusLine?.trim() ? ` ${s.statusLine.trim()}` : "";
    return {
      toneClass: "bg-destructive/15 text-destructive",
      text: `HTTP ${s.statusCode}${line}`.trim()
    };
  }
  return {
    toneClass: "bg-destructive/15 text-destructive",
    text: `${s.errorDescription} (${s.errorCode})`
  };
});

function getApi(): Window["previewApi"] {
  return window.previewApi;
}

/** Accept bare port ("3000") or host-only ("localhost:3000") and make it a full URL. */
function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return `http://localhost:${t}`;
  if (!t.startsWith("http://") && !t.startsWith("https://")) return `http://${t}`;
  return t;
}

function syncPreviewViewportMetrics(): void {
  const el = viewportRef.value;
  if (!el) {
    setPreviewNativeViewportTopPx(null);
    return;
  }
  const r = el.getBoundingClientRect();
  setPreviewNativeViewportTopPx(Math.round(r.top));
  void getApi()?.setBounds({
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  });
}

function navigate(): void {
  const raw = urlInput.value.trim();
  if (!raw) return;
  const url = normalizeUrl(raw);
  urlInput.value = url;
  savePreviewPanelUrl(workspace.activeWorktreeId, url);
  loadState.value = { kind: "loading", url: "" };
  void getApi()?.setUrl(url);
}

function reload(): void {
  loadState.value = { kind: "loading", url: "" };
  void getApi()?.reload();
}

function openPreviewDevTools(): void {
  void getApi()?.openDevTools();
}

let resizeObserver: ResizeObserver | null = null;
let unsubscribeLoadState: (() => void) | null = null;

onMounted(async () => {
  await getApi()?.show().catch(console.error);
  syncPreviewViewportMetrics();
  resizeObserver = new ResizeObserver(() => syncPreviewViewportMetrics());
  if (panelRootRef.value) resizeObserver.observe(panelRootRef.value);

  const api = getApi();
  if (api?.onLoadState) {
    unsubscribeLoadState = api.onLoadState((payload) => {
      loadState.value = payload;
      void nextTickBounds();
    });
  }
});

function nextTickBounds(): void {
  requestAnimationFrame(() => syncPreviewViewportMetrics());
}

onUnmounted(() => {
  resizeObserver?.disconnect();
  unsubscribeLoadState?.();
  unsubscribeLoadState = null;
  setPreviewNativeViewportTopPx(null);
  void getApi()?.hide();
});
</script>
