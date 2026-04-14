<template>
  <!-- Floating UI collision boundary aligned to the preview content area (in-DOM iframe). -->
  <Teleport to="body">
    <div
      ref="collisionMirrorRef"
      data-testid="preview-native-collision-mirror"
      aria-hidden="true"
      :style="collisionMirrorStyle"
    />
  </Teleport>
  <div ref="panelRootRef" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <!-- URL bar -->
    <div
      class="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border bg-background px-2 py-1"
    >
      <Badge
        v-if="loadBadge"
        data-testid="preview-load-badge"
        :variant="loadBadge.variant"
        class="max-w-[min(11rem,42%)] shrink-0 truncate border-border px-1.5 py-0 font-mono text-[10px] tabular-nums leading-none"
        :title="loadBadge.title"
      >
        {{ loadBadge.label }}
      </Badge>
      <input
        v-model="urlInput"
        data-testid="preview-url-input"
        class="min-w-0 flex-1 rounded bg-transparent px-2 py-0.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-border"
        placeholder="Port or URL — auto-loads when this tab opens; Enter to go"
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
        title="Open in system browser (full DevTools, separate window)"
        @click="openPreviewInSystemBrowser"
      >
        <Bug class="h-3.5 w-3.5" />
      </button>
    </div>
    <div ref="viewportRef" data-testid="preview-viewport" class="relative min-h-0 flex-1 overflow-hidden">
      <iframe
        v-if="iframeSrc"
        :key="iframeReloadKey"
        ref="iframeRef"
        data-testid="preview-iframe"
        class="absolute inset-0 h-full w-full border-0 bg-background"
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin"
        referrerpolicy="no-referrer-when-downgrade"
        :src="iframeSrc"
        @load="onIframeLoad"
        @error="onIframeError"
      />
      <div v-else class="absolute inset-0 bg-muted/30" aria-hidden="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { setPreviewNativeCollisionEl, setPreviewNativeViewportTopPx } from "@/composables/previewNativeViewportTop";
import Badge from "@/components/ui/Badge.vue";
import type { BadgeVariant } from "@/components/ui/badge";
import { Bug, RotateCw } from "lucide-vue-next";
import type { PreviewLoadStatePayload } from "@shared/ipc";
import { loadPreviewPanelUrl, savePreviewPanelUrl } from "@/composables/usePreviewPanelUrlPersistence";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const workspace = useWorkspaceStore();
const urlInput = ref("");
const collisionMirrorRef = ref<HTMLDivElement | null>(null);
const panelRootRef = ref<HTMLDivElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);
/** Current navigation target for the preview iframe. */
const iframeSrc = ref("");
/** Bump to force iframe remount (reload). */
const iframeReloadKey = ref(0);
/** Monotonic counter so late `load` / `probeUrl` from a superseded navigation are ignored. */
let loadSeq = 0;

/** Screen-space rect of the preview viewport (for Floating UI + tab chrome offset). */
const viewportScreenRect = ref<{ top: number; left: number; width: number; height: number } | null>(null);

const collisionMirrorStyle = computed(() => {
  const r = viewportScreenRect.value;
  if (
    !r ||
    !Number.isFinite(r.top) ||
    !Number.isFinite(r.left) ||
    !Number.isFinite(r.width) ||
    !Number.isFinite(r.height) ||
    r.width < 2 ||
    r.height < 2
  ) {
    return { display: "none" } as Record<string, string>;
  }
  return {
    position: "fixed",
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    opacity: "0",
    pointerEvents: "none",
    zIndex: "1"
  } as Record<string, string>;
});
const loadState = ref<PreviewLoadStatePayload | null>(null);

watch(
  () => workspace.activeWorktreeId,
  (worktreeId, prevWorktreeId) => {
    loadState.value = null;
    if (prevWorktreeId != null && prevWorktreeId !== worktreeId) {
      iframeSrc.value = "";
    }
    urlInput.value = loadPreviewPanelUrl(worktreeId);
    if (prevWorktreeId != null && prevWorktreeId !== worktreeId) {
      void nextTick(() => navigate());
    }
  },
  { immediate: true }
);

const loadBadge = computed((): null | { label: string; title: string; variant: BadgeVariant } => {
  const s = loadState.value;
  if (!s) return null;
  if (s.kind === "loading") {
    return {
      label: "…",
      title: "Loading…",
      variant: "secondary"
    };
  }
  if (s.kind === "loaded") {
    return {
      label: `HTTP ${s.statusCode}`,
      title: `Ready · HTTP ${s.statusCode}`,
      variant: "outline"
    };
  }
  if (s.kind === "httpError") {
    const line = s.statusLine?.trim() ?? "";
    const title = line ? `HTTP ${s.statusCode} ${line}` : `HTTP ${s.statusCode}`;
    return {
      label: `HTTP ${s.statusCode}`,
      title,
      variant: "destructive"
    };
  }
  if (s.kind !== "failed") return null;
  const desc =
    typeof s.errorDescription === "string" && s.errorDescription.trim()
      ? s.errorDescription.trim()
      : "Load failed";
  const code = typeof s.errorCode === "number" && Number.isFinite(s.errorCode) ? s.errorCode : 0;
  const title = `${desc} (${code})`;
  const short = desc.length > 18 ? `${desc.slice(0, 16)}…` : desc;
  return {
    label: short,
    title,
    variant: "destructive"
  };
});

function getApi(): Window["previewApi"] {
  return window.previewApi;
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return `http://localhost:${t}`;
  if (!t.startsWith("http://") && !t.startsWith("https://")) return `http://${t}`;
  return t;
}

function syncPreviewViewportMetrics(): void {
  const el = viewportRef.value;
  if (!el) {
    viewportScreenRect.value = null;
    setPreviewNativeViewportTopPx(null);
    setPreviewNativeCollisionEl(null);
    return;
  }
  const r = el.getBoundingClientRect();
  const top = r.top;
  const left = r.left;
  const width = r.width;
  const height = r.height;
  const dimsOk =
    Number.isFinite(top) &&
    Number.isFinite(left) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 2 &&
    height >= 2;
  viewportScreenRect.value = { top, left, width, height };
  if (dimsOk) {
    setPreviewNativeViewportTopPx(Math.round(top));
  } else {
    setPreviewNativeViewportTopPx(null);
  }
  void nextTick(() => {
    const mirror = collisionMirrorRef.value;
    const vr = viewportScreenRect.value;
    setPreviewNativeCollisionEl(mirror && vr && vr.width >= 2 && vr.height >= 2 ? mirror : null);
  });
}

async function applyProbeAfterLoad(url: string, seq: number): Promise<void> {
  const api = getApi();
  if (!api?.probeUrl) {
    if (seq !== loadSeq) return;
    loadState.value = { kind: "loaded", url, statusCode: 200 };
    return;
  }
  try {
    const probe = await api.probeUrl(url);
    if (seq !== loadSeq) return;
    if (!probe.ok) {
      loadState.value = {
        kind: "failed",
        url,
        errorCode: 0,
        errorDescription: probe.message
      };
      return;
    }
    if (probe.status >= 400) {
      loadState.value = {
        kind: "httpError",
        url,
        statusCode: probe.status,
        statusLine: `HTTP ${probe.status}`
      };
      return;
    }
    loadState.value = { kind: "loaded", url, statusCode: probe.status };
  } catch (e) {
    if (seq !== loadSeq) return;
    loadState.value = {
      kind: "failed",
      url,
      errorCode: 0,
      errorDescription: String(e)
    };
  }
}

function onIframeLoad(): void {
  const url = iframeSrc.value;
  if (!url) return;
  const seq = loadSeq;
  void applyProbeAfterLoad(url, seq);
}

function onIframeError(): void {
  const url = iframeSrc.value;
  if (!url) return;
  loadState.value = {
    kind: "failed",
    url,
    errorCode: 0,
    errorDescription: "Iframe load error"
  };
}

function navigate(): void {
  const raw = urlInput.value.trim();
  if (!raw) return;
  const url = normalizeUrl(raw);
  urlInput.value = url;
  savePreviewPanelUrl(workspace.activeWorktreeId, url);
  loadSeq += 1;
  loadState.value = { kind: "loading", url: "" };
  if (url === iframeSrc.value) {
    iframeReloadKey.value += 1;
    return;
  }
  iframeSrc.value = url;
}

function reload(): void {
  const u = iframeSrc.value;
  if (!u) return;
  loadSeq += 1;
  loadState.value = { kind: "loading", url: "" };
  iframeReloadKey.value += 1;
}

function openPreviewInSystemBrowser(): void {
  const u = iframeSrc.value.trim();
  if (!u) return;
  void getApi()?.openUrlExternally(u).catch(() => {});
}

let resizeObserver: ResizeObserver | null = null;
let viewportMetricsRafId = 0;

function schedulePreviewViewportMetrics(): void {
  if (viewportMetricsRafId !== 0) {
    cancelAnimationFrame(viewportMetricsRafId);
  }
  viewportMetricsRafId = requestAnimationFrame(() => {
    viewportMetricsRafId = 0;
    syncPreviewViewportMetrics();
  });
}

onMounted(() => {
  syncPreviewViewportMetrics();
  resizeObserver = new ResizeObserver(() => schedulePreviewViewportMetrics());
  if (panelRootRef.value) resizeObserver.observe(panelRootRef.value);
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);

  void nextTick(() => {
    syncPreviewViewportMetrics();
    navigate();
  });
});

onUnmounted(() => {
  if (viewportMetricsRafId !== 0) {
    cancelAnimationFrame(viewportMetricsRafId);
    viewportMetricsRafId = 0;
  }
  resizeObserver?.disconnect();
  viewportScreenRect.value = null;
  setPreviewNativeViewportTopPx(null);
  setPreviewNativeCollisionEl(null);
  iframeSrc.value = "";
});
</script>
