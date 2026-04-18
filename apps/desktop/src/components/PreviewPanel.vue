<template>
  <!-- Floating UI collision boundary aligned to the preview content area (native BrowserView). -->
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
      <Button
        v-if="showThreadSidebarExpand"
        data-testid="preview-thread-sidebar-expand"
        variant="outline"
        size="icon-sm"
        class="ml-20"
        title="Show thread sidebar"
        aria-label="Show thread sidebar"
        @click="emit('expandThreadSidebar')"
      >
        <PanelLeftOpen class="h-4 w-4" aria-hidden="true" />
        <span class="sr-only">Show thread sidebar</span>
      </Button>
      <Badge
        v-if="loadBadge"
        data-testid="preview-load-badge"
        :variant="loadBadge.variant"        
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
        data-testid="preview-back-btn"
        class="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        title="Back"
        :disabled="!canGoBack"
        @click="goBack"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
      </button>
      <button
        data-testid="preview-forward-btn"
        class="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        title="Forward"
        :disabled="!canGoForward"
        @click="goForward"
      >
        <ChevronRight class="h-3.5 w-3.5" />
      </button>
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
        :class="{ 'bg-muted text-foreground': previewDevtoolsOpen }"
        :aria-pressed="previewDevtoolsOpen"
        title="Toggle embedded Chrome DevTools (device toolbar and Dock side: Chrome ⋮ menu)"
        @click="toggleEmbeddedDevTools"
      >
        <Bug class="h-3.5 w-3.5" />
      </button>
    </div>
    <!-- Indeterminate loading bar -->
    <div class="relative h-0.5 w-full shrink-0 overflow-hidden bg-transparent">
      <div
        v-if="loadState?.kind === 'loading'"
        class="preview-loading-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary"
      />
    </div>
    <div ref="viewportRef" data-testid="preview-viewport" class="relative min-h-0 flex-1 overflow-hidden">
      <div
        class="absolute inset-0 bg-muted/30"
        :class="{ 'opacity-0': !activePreviewUrl }"
        aria-hidden="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { setPreviewNativeCollisionEl, setPreviewNativeViewportTopPx } from "@/composables/previewNativeViewportTop";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import type { BadgeVariant } from "@/components/ui/badge";
import { Bug, ChevronLeft, ChevronRight, PanelLeftOpen, RotateCw } from "lucide-vue-next";
import type { PreviewLoadStatePayload } from "@shared/ipc";
import {
  loadPreviewPanelDevtoolsOpen,
  loadPreviewPanelUrl,
  savePreviewPanelDevtoolsOpen,
  savePreviewPanelUrl
} from "@/composables/usePreviewPanelUrlPersistence";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const workspace = useWorkspaceStore();
const props = withDefaults(
  defineProps<{
    isVisible?: boolean;
    showThreadSidebarExpand?: boolean;
  }>(),
  {
    isVisible: true,
    showThreadSidebarExpand: false
  }
);
const emit = defineEmits<{
  expandThreadSidebar: [];
}>();
const urlInput = ref("");
const collisionMirrorRef = ref<HTMLDivElement | null>(null);
const panelRootRef = ref<HTMLDivElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);
/** Current navigation target for the preview BrowserView. */
const activePreviewUrl = ref("");
/** Embedded Chrome DevTools split is open (main-process). */
const previewDevtoolsOpen = ref(false);
const persistedDevtoolsOpen = ref(false);
const canGoBack = ref(false);
const canGoForward = ref(false);
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
      activePreviewUrl.value = "";
      previewDevtoolsOpen.value = false;
      persistedDevtoolsOpen.value = false;
      canGoBack.value = false;
      canGoForward.value = false;
      void getApi()?.detachNative?.().catch(() => {});
    }
    urlInput.value = loadPreviewPanelUrl(worktreeId);
    persistedDevtoolsOpen.value = loadPreviewPanelDevtoolsOpen(worktreeId);
    if (props.isVisible && prevWorktreeId != null && prevWorktreeId !== worktreeId) {
      void nextTick(() => navigate());
    }
  },
  { immediate: true }
);

watch(
  () => props.isVisible,
  (visible) => {
    if (!visible) {
      pushNativeBounds();
      return;
    }
    void nextTick(() => {
      syncPreviewViewportMetrics();
      if (!activePreviewUrl.value.trim()) {
        navigate();
      }
    });
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

function pushNativeBounds(): void {
  const api = getApi();
  if (!api?.setNativeBounds) return;
  if (!props.isVisible) {
    void api.setNativeBounds({ x: 0, y: 0, width: 0, height: 0 }).catch(() => {});
    return;
  }
  const r = viewportScreenRect.value;
  if (!r || r.width < 2 || r.height < 2) {
    void api.setNativeBounds({ x: 0, y: 0, width: 0, height: 0 }).catch(() => {});
    return;
  }
  void api
    .setNativeBounds({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    })
    .catch(() => {});
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
  pushNativeBounds();
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

async function runLoadUrl(url: string, seq: number): Promise<void> {
  pushNativeBounds();
  const api = getApi();
  if (!api?.loadNativeUrl) {
    if (seq !== loadSeq) return;
    loadState.value = {
      kind: "failed",
      url,
      errorCode: 0,
      errorDescription: "previewApi.loadNativeUrl is not available"
    };
    return;
  }
  const result = await api.loadNativeUrl(url);
  if (seq !== loadSeq) return;
  if (!result.ok) {
    loadState.value = {
      kind: "failed",
      url,
      errorCode: result.errorCode,
      errorDescription: result.errorDescription
    };
    return;
  }
  await applyProbeAfterLoad(url, seq);
  await syncEmbeddedDevToolsWithPersistence(seq);
}

async function runReload(seq: number): Promise<void> {
  pushNativeBounds();
  const api = getApi();
  const url = activePreviewUrl.value;
  if (!url) return;
  if (!api?.reloadNative) {
    if (seq !== loadSeq) return;
    loadState.value = {
      kind: "failed",
      url,
      errorCode: 0,
      errorDescription: "previewApi.reloadNative is not available"
    };
    return;
  }
  const result = await api.reloadNative();
  if (seq !== loadSeq) return;
  if (!result.ok) {
    loadState.value = {
      kind: "failed",
      url,
      errorCode: result.errorCode,
      errorDescription: result.errorDescription
    };
    return;
  }
  await applyProbeAfterLoad(url, seq);
  await syncEmbeddedDevToolsWithPersistence(seq);
}

async function syncEmbeddedDevToolsWithPersistence(seq: number): Promise<void> {
  if (seq !== loadSeq) return;
  if (!activePreviewUrl.value.trim()) return;
  if (previewDevtoolsOpen.value === persistedDevtoolsOpen.value) return;
  const api = getApi();
  if (!api?.toggleEmbeddedDevTools) return;
  try {
    const r = await api.toggleEmbeddedDevTools();
    if (seq !== loadSeq) return;
    if (r.ok) previewDevtoolsOpen.value = r.open;
  } catch {
    /* no-op */
  }
}

function navigate(): void {
  if (!props.isVisible) return;
  const raw = urlInput.value.trim();
  if (!raw) return;
  const url = normalizeUrl(raw);
  urlInput.value = url;
  savePreviewPanelUrl(workspace.activeWorktreeId, url);
  loadSeq += 1;
  const seq = loadSeq;
  loadState.value = { kind: "loading", url: "" };
  if (url === activePreviewUrl.value) {
    void runReload(seq);
    return;
  }
  activePreviewUrl.value = url;
  void runLoadUrl(url, seq);
}

function reload(): void {
  if (!props.isVisible) return;
  const u = activePreviewUrl.value;
  if (!u) return;
  loadSeq += 1;
  const seq = loadSeq;
  loadState.value = { kind: "loading", url: "" };
  void runReload(seq);
}

async function toggleEmbeddedDevTools(): Promise<void> {
  if (!activePreviewUrl.value.trim()) return;
  const api = getApi();
  if (!api?.toggleEmbeddedDevTools) return;
  try {
    const r = await api.toggleEmbeddedDevTools();
    if (r.ok) {
      previewDevtoolsOpen.value = r.open;
      persistedDevtoolsOpen.value = r.open;
      savePreviewPanelDevtoolsOpen(workspace.activeWorktreeId, r.open);
    } else {
      previewDevtoolsOpen.value = false;
    }
  } catch {
    previewDevtoolsOpen.value = false;
  }
}

async function goBack(): Promise<void> {
  await getApi()?.goBack?.();
}

async function goForward(): Promise<void> {
  await getApi()?.goForward?.();
}

let resizeObserver: ResizeObserver | null = null;
let viewportMetricsRafId = 0;
let offEmbeddedDevtoolsState: (() => void) | undefined;
let offNavigationUrl: (() => void) | undefined;
let offNavigationStateChanged: (() => void) | undefined;

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
  offEmbeddedDevtoolsState = getApi()?.onPreviewEmbeddedDevtoolsOpen?.((open) => {
    // Runtime open/close updates can be transient while navigating; keep persisted
    // value as user intent so devtools can be restored ("warm") after page changes.
    previewDevtoolsOpen.value = open;
  });
  offNavigationUrl = getApi()?.onNavigationUrl?.((url, back, forward) => {
    urlInput.value = url;
    savePreviewPanelUrl(workspace.activeWorktreeId, url);
    canGoBack.value = back;
    canGoForward.value = forward;
  });
  offNavigationStateChanged = getApi()?.onNavigationStateChanged?.((state) => {
    if (state.url) {
      urlInput.value = state.url;
      savePreviewPanelUrl(workspace.activeWorktreeId, state.url);
    }
    canGoBack.value = state.canGoBack;
    canGoForward.value = state.canGoForward;
  });
  syncPreviewViewportMetrics();
  resizeObserver = new ResizeObserver(() => schedulePreviewViewportMetrics());
  if (panelRootRef.value) resizeObserver.observe(panelRootRef.value);
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);

  void nextTick(() => {
    syncPreviewViewportMetrics();
    if (props.isVisible) navigate();
  });
});

onUnmounted(() => {
  offEmbeddedDevtoolsState?.();
  offEmbeddedDevtoolsState = undefined;
  offNavigationUrl?.();
  offNavigationUrl = undefined;
  offNavigationStateChanged?.();
  offNavigationStateChanged = undefined;
  if (viewportMetricsRafId !== 0) {
    cancelAnimationFrame(viewportMetricsRafId);
    viewportMetricsRafId = 0;
  }
  resizeObserver?.disconnect();
  viewportScreenRect.value = null;
  setPreviewNativeViewportTopPx(null);
  setPreviewNativeCollisionEl(null);
  activePreviewUrl.value = "";
  previewDevtoolsOpen.value = false;
  canGoBack.value = false;
  canGoForward.value = false;
  void getApi()?.detachNative?.().catch(() => {});
});

</script>

<style scoped>
@keyframes preview-sweep {
  0% {
    left: -40%;
    width: 40%;
  }
  50% {
    left: 30%;
    width: 60%;
  }
  100% {
    left: 110%;
    width: 40%;
  }
}

.preview-loading-bar {
  animation: preview-sweep 1.4s ease-in-out infinite;
}
</style>
