<template>
  <!-- Mirror rect for Floating UI: native WebContentsView stacks above HTML in this region. -->
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
        title="Open preview DevTools (docked below the page)"
        @click="openPreviewDevTools"
      >
        <Bug class="h-3.5 w-3.5" />
      </button>
    </div>
    <!-- Placeholder div — native WebContentsView is positioned over this by the main process -->
    <div ref="viewportRef" data-testid="preview-viewport" class="min-h-0 flex-1" />
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
/** Screen-space rect of the preview placeholder (native view is stacked here). */
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
    /** Browser viewport mirror: lowest fixed z-index so toasts/popovers/modals stack above it (native WebContentsView still paints above all HTML). */
    zIndex: "1"
  } as Record<string, string>;
});
const loadState = ref<PreviewLoadStatePayload | null>(null);

watch(
  () => workspace.activeWorktreeId,
  (worktreeId, prevWorktreeId) => {
    loadState.value = null;
    urlInput.value = loadPreviewPanelUrl(worktreeId);
    /** After initial `immediate` run, switching worktrees should load that worktree's saved URL. */
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
  viewportScreenRect.value = {
    top,
    left,
    width,
    height
  };
  /** Flex layout often reports 0×0 on first paint; invalid bounds have crashed native `WebContentsView.setBounds`. */
  if (dimsOk) {
    setPreviewNativeViewportTopPx(Math.round(top));
    void getApi()
      ?.setBounds({
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height)
      })
      .catch(() => {});
  } else {
    setPreviewNativeViewportTopPx(null);
  }
  void nextTick(() => {
    const mirror = collisionMirrorRef.value;
    const vr = viewportScreenRect.value;
    setPreviewNativeCollisionEl(mirror && vr && vr.width >= 2 && vr.height >= 2 ? mirror : null);
  });
}

function navigate(): void {
  const raw = urlInput.value.trim();
  if (!raw) return;
  const url = normalizeUrl(raw);
  urlInput.value = url;
  savePreviewPanelUrl(workspace.activeWorktreeId, url);
  loadState.value = { kind: "loading", url: "" };
  void getApi()?.setUrl(url).catch(() => {});
}

function reload(): void {
  loadState.value = { kind: "loading", url: "" };
  void getApi()?.reload().catch(() => {});
}

function openPreviewDevTools(): void {
  void getApi()?.openDevTools().catch(() => {});
}

let resizeObserver: ResizeObserver | null = null;
let unsubscribeLoadState: (() => void) | null = null;

onMounted(async () => {
  await getApi()?.show().catch(console.error);
  void getApi()?.setDeviceEmulation("desktop").catch(() => {});
  syncPreviewViewportMetrics();
  resizeObserver = new ResizeObserver(() => syncPreviewViewportMetrics());
  if (panelRootRef.value) resizeObserver.observe(panelRootRef.value);
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);

  const api = getApi();
  if (api?.onLoadState) {
    unsubscribeLoadState = api.onLoadState((payload) => {
      loadState.value = payload;
      void nextTickBounds();
    });
  }

  void nextTick(() => {
    syncPreviewViewportMetrics();
    navigate();
  });
});

function nextTickBounds(): void {
  requestAnimationFrame(() => syncPreviewViewportMetrics());
}

onUnmounted(() => {
  resizeObserver?.disconnect();
  unsubscribeLoadState?.();
  unsubscribeLoadState = null;
  viewportScreenRect.value = null;
  setPreviewNativeViewportTopPx(null);
  setPreviewNativeCollisionEl(null);
  void getApi()?.setDeviceEmulation("desktop").catch(() => {});
  void getApi()?.hide().catch(() => {});
});
</script>
