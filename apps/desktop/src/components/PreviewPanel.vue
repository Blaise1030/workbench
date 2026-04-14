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
      <TooltipProvider :delay-duration="300">
        <div
          class="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5"
          role="group"
          aria-label="Preview viewport size"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                data-testid="preview-emulation-mobile"
                :class="emulationToggleClass('mobile')"
                :aria-pressed="deviceEmulationPreset === 'mobile'"
                aria-label="Mobile preview, 390 by 844. Press again to use full panel."
                @click="setDeviceEmulationPreset('mobile')"
              >
                <Smartphone class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span class="max-sm:sr-only">Mobile</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="max-w-[16rem]">
              Mobile viewport (390×844). Matches many phone layouts. Click again to fill the preview panel.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                data-testid="preview-emulation-tablet"
                :class="emulationToggleClass('tablet')"
                :aria-pressed="deviceEmulationPreset === 'tablet'"
                aria-label="Tablet preview, 834 by 1194. Press again to use full panel."
                @click="setDeviceEmulationPreset('tablet')"
              >
                <Tablet class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span class="max-sm:sr-only">Tablet</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="max-w-[16rem]">
              Tablet viewport (834×1194). Click again to fill the preview panel.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                data-testid="preview-emulation-desktop"
                :class="emulationToggleClass('desktop')"
                :aria-pressed="deviceEmulationPreset === null"
                aria-label="Desktop preview, full panel width"
                @click="setDeviceEmulationPreset('desktop')"
              >
                <Monitor class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span class="max-sm:sr-only">Desktop</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" class="max-w-[16rem]">
              Desktop — use the full preview area with no device frame.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
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
        title="Open preview DevTools (docked below the page). Mobile, Tablet, and Desktop set viewport emulation."
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Bug, Monitor, RotateCw, Smartphone, Tablet } from "lucide-vue-next";
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
  if (!r || r.width < 2 || r.height < 2) {
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
/** `null` = desktop (no emulation); otherwise active preset sent to main. */
const deviceEmulationPreset = ref<"mobile" | "tablet" | null>(null);

function emulationToggleClass(p: "mobile" | "tablet" | "desktop"): string {
  const active = p === "desktop" ? deviceEmulationPreset.value === null : deviceEmulationPreset.value === p;
  return [
    "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium outline-none transition-colors",
    active
      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  ].join(" ");
}

async function setDeviceEmulationPreset(p: "mobile" | "tablet" | "desktop"): Promise<void> {
  const api = getApi();
  if (!api?.setDeviceEmulation) return;
  if (p === "desktop") {
    deviceEmulationPreset.value = null;
    await api.setDeviceEmulation("desktop");
    return;
  }
  if (deviceEmulationPreset.value === p) {
    deviceEmulationPreset.value = null;
    await api.setDeviceEmulation("desktop");
    return;
  }
  deviceEmulationPreset.value = p;
  await api.setDeviceEmulation(p);
}

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
  const title = `${s.errorDescription} (${s.errorCode})`;
  const short =
    s.errorDescription.length > 18 ? `${s.errorDescription.slice(0, 16)}…` : s.errorDescription;
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
  viewportScreenRect.value = {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height
  };
  setPreviewNativeViewportTopPx(Math.round(r.top));
  void getApi()?.setBounds({
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  });
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
  deviceEmulationPreset.value = null;
  void getApi()?.setDeviceEmulation("desktop");
  void getApi()?.hide();
});
</script>
