<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { Loader2 } from "lucide-vue-next";
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import { buildPasteText } from "@/contextQueue/formatters";
import {
  injectContextToAgentKey,
  openWorkspaceFileKey,
  threadContextQueueKey
} from "@/contextQueue/injectionKeys";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/lib/contextQueueAnchor";
import { resolveSelectionFilePath } from "@/lib/selectionFilePath";
import { useToast } from "@/composables/useToast";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

/** Union `.xterm-selection` rects (viewport coords) when the DOM renderer exposes them. */
function mergeXtermSelectionRects(wrap: HTMLElement): Rect | null {
  const nodes = wrap.querySelectorAll(".xterm-selection");
  if (!nodes.length) return null;
  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const n of nodes) {
    const r = (n as HTMLElement).getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.right);
    maxB = Math.max(maxB, r.bottom);
  }
  if (minL === Infinity) return null;
  return {
    left: minL,
    top: minT,
    width: Math.max(4, maxR - minL),
    height: Math.max(4, maxB - minT)
  };
}

const props = withDefaults(
  defineProps<{
    worktreeId: string;
    /** When set, PTY is keyed by thread so each thread has its own shell. */
    threadId: string;
    cwd: string;
    /** After `ptyCreate` for this thread, type `command` + Enter once. */
    pendingAgentBootstrap?: PendingAgentBootstrap | null;
    /**
     * `agent` — one PTY per thread (or worktree fallback). `shell` — extra PTY per worktree slot
     * (see `shellSlotId`), independent of the active thread.
     */
    ptyKind?: "agent" | "shell";
    /** Distinct id for each extra terminal tab (PTY key includes worktree + this). */
    shellSlotId?: string;
    /**
     * Label for queued terminal snippets (overlay shells). E.g. "Terminal 1" to match the tab.
     * Agent pane ignores this and uses "Agent".
     */
    queueSessionLabel?: string | null;
  }>(),
  { ptyKind: "agent", shellSlotId: "main", queueSessionLabel: null }
);

const emit = defineEmits<{
  bootstrapConsumed: [];
  "user-typed": [sessionId: string];
  /** Raw stdin from xterm before it is sent to the PTY (agent pane only). Used to derive thread titles from the first line. */
  "stdin-chunk": [sessionId: string, data: string];
}>();

const paneAriaLabel = computed(() =>
  props.ptyKind === "shell" ? "Terminal" : "Agent"
);

const threadQueue = inject(threadContextQueueKey, undefined);
const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const openWorkspaceFile = inject(openWorkspaceFileKey, undefined);
const toast = useToast();
const terminalQueueVisible = ref(false);
const terminalQueueAnchor = ref<Rect | null>(null);
const pendingTerminalText = ref("");
const pendingTerminalGoToPath = ref<string | null>(null);
let pendingTerminalGoToSeq = 0;
/** Last pointer-up inside the terminal (viewport); used when xterm has no DOM selection layer. */
const lastTerminalPointerClient = ref<{ x: number; y: number } | null>(null);
let terminalQueuePointerCleanup: (() => void) | null = null;

function terminalSelectionAnchorRect(wrap: HTMLElement): Rect {
  const merged = mergeXtermSelectionRects(wrap);
  if (merged) return merged;
  const p = lastTerminalPointerClient.value;
  if (p) {
    return { left: p.x - 6, top: p.y - 6, width: 12, height: 12 };
  }
  const r = wrap.getBoundingClientRect();
  return {
    left: r.left + 12,
    top: r.bottom - 48,
    width: 24,
    height: 12
  };
}

function terminalQueueSessionLabel(): string {
  const custom = props.queueSessionLabel?.trim();
  return custom && custom.length > 0 ? custom : "Shell";
}

function terminalQueueCapture(text: string): QueueCapture {
  if (props.ptyKind === "agent") {
    return { source: "terminal", selectedText: text, agentTab: true };
  }
  return { source: "terminal", selectedText: text, sessionLabel: terminalQueueSessionLabel() };
}

const containerRef = ref<HTMLElement | null>(null);
const ptyBusy = ref(false);
/** Routes stdin/resize to the PTY the renderer is showing (avoids stale worktree-only keys). */
const activeSessionId = ref("");
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let ptyDataDisposer: (() => void) | null = null;
let attachGeneration = 0;
/** `ptyCreate` returned an existing session (`created: false`); skip `mode: "resume"` autostart. */
let attachedWithLivePty = false;
/** After first mount attach, focus terminal when session props change (e.g. thread switch). */
let didCompleteInitialAttach = false;
let dropHandlersCleanup: (() => void) | null = null;

/** Safe for POSIX shells (zsh/bash): single-quote and escape embedded quotes. */
function shellQuotePathForPty(absPath: string): string {
  if (absPath === "") return "''";
  if (!/[\s#'"`$&|;<>*?()[\]{}~!\\]/.test(absPath)) {
    return absPath;
  }
  return `'${absPath.replace(/'/g, `'\\''`)}'`;
}

function pathsFromFileDrop(dt: DataTransfer): string[] {
  const api = getApi();
  const getPath = api?.getPathForFile;
  if (!getPath || dt.files.length === 0) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const file = dt.files.item(i);
    if (!file) continue;
    try {
      out.push(getPath(file));
    } catch {
      // Invalid / non-local file in some environments
    }
  }
  return out;
}

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

function terminalMonoFontStack(): string {
  if (typeof document === "undefined") {
    return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  }
  const stack = getComputedStyle(document.documentElement).getPropertyValue("--font-app-mono").trim();
  return stack || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
}

function ptySessionId(): string {
  if (props.ptyKind === "shell") {
    return `__shell:${props.worktreeId}:${props.shellSlotId}`;
  }
  return props.threadId ? props.threadId : `__wt:${props.worktreeId}`;
}

function applyTheme(): void {
  if (!terminal || !containerRef.value) return;
  const cs = getComputedStyle(containerRef.value);
  const bg = cs.backgroundColor || "#ffffff";
  const fg = cs.color || "#0a0a0a";
  terminal.options.theme = { background: bg, foreground: fg, cursor: fg };
}

function fit(): void {
  if (!terminal || !fitAddon || !containerRef.value) return;
  const { clientWidth, clientHeight } = containerRef.value;
  if (clientWidth < 2 || clientHeight < 2) return;
  fitAddon.fit();
}

async function restoreDisplayFromBuffer(): Promise<void> {
  const api = getApi();
  const sid = activeSessionId.value;
  if (!api?.ptyGetBuffer || !terminal || !sid) return;
  const gen = attachGeneration;
  try {
    const { buffer } = await api.ptyGetBuffer(sid);
    if (gen !== attachGeneration) return;
    terminal.reset();
    if (buffer) {
      terminal.write(buffer);
    }
    fit();
  } catch {
    /* IPC unavailable */
  }
}

/** Inject bootstrap CLI into the live PTY once per pending payload (parent clears after `bootstrapConsumed`). */
async function tryInjectPendingBootstrap(sessionId: string, gen: number): Promise<void> {
  const api = getApi();
  if (!api || !terminal) return;
  const boot = props.pendingAgentBootstrap;
  if (!boot?.command.trim() || boot.threadId !== sessionId) return;
  if (gen !== attachGeneration) return;
  void api.ptyWrite(sessionId, `${boot.command}\r`);
  emit("bootstrapConsumed");
}

async function attachPty(): Promise<void> {
  const gen = ++attachGeneration;
  const sessionId = ptySessionId();
  ptyBusy.value = true;
  try {
    const api = getApi();
    if (!api || !terminal) return;

    ptyDataDisposer?.();
    ptyDataDisposer = null;

    terminal.reset();

    attachedWithLivePty = false;
    const { buffer, created = true } = await api.ptyCreate(sessionId, props.cwd, props.worktreeId);
    if (gen !== attachGeneration) return;

    activeSessionId.value = sessionId;
    attachedWithLivePty = !created;

    if (buffer) {
      terminal.write(buffer);
    }

    ptyDataDisposer = api.onPtyData((id, data) => {
      if (gen !== attachGeneration || id !== sessionId) return;
      terminal?.write(data);
    });

    // Fresh PTY: always try inject. Reused PTY (`created: false`): only for prompt/bootstrap —
    // avoids re-typing `* --resume` into an already-live agent, but still covers (a) prompt set
    // after attach and (b) a superseding re-attach that races the first attach so the PTY exists
    // while `created` is false yet pending was never consumed.
    const bootMode = props.pendingAgentBootstrap?.mode ?? "prompt";
    if (created || bootMode === "prompt") {
      await tryInjectPendingBootstrap(sessionId, gen);
    }
  } finally {
    if (gen === attachGeneration) {
      ptyBusy.value = false;
    }
  }
}

onMounted(async () => {
  const el = containerRef.value;
  if (!el) return;

  terminal = new Terminal({
    fontFamily: terminalMonoFontStack(),
    fontSize: 12,
    lineHeight: 1.35,
    cursorBlink: true,
    cursorStyle: "block",
    convertEol: false,
    disableStdin: false,
    bellStyle: "none"
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(el);

  function onTerminalPointerUp(e: PointerEvent): void {
    if (e.button !== 0) return;
    lastTerminalPointerClient.value = { x: e.clientX, y: e.clientY };
  }
  el.addEventListener("pointerup", onTerminalPointerUp);
  terminalQueuePointerCleanup = () => {
    el.removeEventListener("pointerup", onTerminalPointerUp);
    terminalQueuePointerCleanup = null;
  };

  terminal.attachCustomKeyEventHandler((domEvent) => {
    if (domEvent.type !== "keydown") return true;
    const mod = domEvent.ctrlKey || domEvent.metaKey;
    if (mod && domEvent.shiftKey && domEvent.key.toLowerCase() === "r") {
      domEvent.preventDefault();
      void restoreDisplayFromBuffer();
      return false;
    }
    return true;
  });
  applyTheme();
  fit();
  void document.fonts.ready.then(() => fit());

  const api = getApi();
  if (api) {
    terminal.onData((data) => {
      const sid = activeSessionId.value;
      if (sid) {
        emit("user-typed", sid);
        if (props.ptyKind === "agent") emit("stdin-chunk", sid, data);
        void api.ptyWrite(sid, data);
      }
    });
    terminal.onResize(({ cols, rows }) => {
      const sid = activeSessionId.value;
      if (sid) {
        emit("user-typed", sid);
        void api.ptyResize(sid, cols, rows);
      }
    });
  }

  resizeObserver = new ResizeObserver(() => {
    fit();
    applyTheme();
  });
  resizeObserver.observe(el);

  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  await attachPty();
  didCompleteInitialAttach = true;

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const paths = pathsFromFileDrop(e.dataTransfer);
    if (paths.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sid = activeSessionId.value;
    const api = getApi();
    if (!sid || !api) return;
    const payload = paths.map(shellQuotePathForPty).join(" ");
    emit("user-typed", sid);
    void api.ptyWrite(sid, payload);
    terminal?.focus();
  };

  el.addEventListener("dragover", onDragOver);
  el.addEventListener("drop", onDrop);
  dropHandlersCleanup = () => {
    el.removeEventListener("dragover", onDragOver);
    el.removeEventListener("drop", onDrop);
    dropHandlersCleanup = null;
  };

  terminal.onSelectionChange(() => {
    window.requestAnimationFrame(() => {
      // Agent PTY and overlay shell PTYs: same queue / inject-to-agent bar when a thread is active.
      if (!terminal || !threadQueue || !props.threadId) {
        terminalQueueVisible.value = false;
        terminalQueueAnchor.value = null;
        pendingTerminalGoToPath.value = null;
        return;
      }
      if (!terminal.hasSelection()) {
        terminalQueueVisible.value = false;
        terminalQueueAnchor.value = null;
        pendingTerminalText.value = "";
        pendingTerminalGoToPath.value = null;
        return;
      }
      const text = terminal.getSelection().trim();
      if (!text) {
        terminalQueueVisible.value = false;
        terminalQueueAnchor.value = null;
        pendingTerminalGoToPath.value = null;
        return;
      }
      pendingTerminalText.value = terminal.getSelection();
      const wrap = containerRef.value;
      if (wrap) {
        terminalQueueAnchor.value = terminalSelectionAnchorRect(wrap);
        terminalQueueVisible.value = true;
      }
      void updateTerminalSelectionGoToPath(terminal.getSelection());
    });
  });
});

function dismissTerminalQueuePopup(): void {
  terminalQueueVisible.value = false;
  terminalQueueAnchor.value = null;
  pendingTerminalGoToPath.value = null;
}

async function updateTerminalSelectionGoToPath(selectedText: string): Promise<void> {
  const seq = ++pendingTerminalGoToSeq;
  pendingTerminalGoToPath.value = null;
  const resolved = await resolveSelectionFilePath(getApi(), props.cwd, selectedText);
  if (seq !== pendingTerminalGoToSeq) return;
  if (pendingTerminalText.value !== selectedText) return;
  pendingTerminalGoToPath.value = resolved;
}

function onQueueTerminalSelection(): void {
  if (!threadQueue || !props.threadId) {
    toast.error("No thread", "Cannot queue terminal output without a thread session.");
    dismissTerminalQueuePopup();
    return;
  }
  const text = pendingTerminalText.value.trim();
  if (!text) {
    dismissTerminalQueuePopup();
    return;
  }
  const capture = terminalQueueCapture(text);
  threadQueue.addItem(props.threadId, {
    id: crypto.randomUUID(),
    source: "terminal",
    pasteText: buildPasteText(capture),
    meta: {}
  });
  terminal?.clearSelection();
  dismissTerminalQueuePopup();
  pendingTerminalText.value = "";
}

async function onInjectTerminalSelectionToAgent(): Promise<void> {
  if (!props.threadId) {
    toast.error("No thread", "Cannot send terminal output without a thread session.");
    dismissTerminalQueuePopup();
    return;
  }
  const text = pendingTerminalText.value.trim();
  if (!text) {
    dismissTerminalQueuePopup();
    return;
  }
  if (!injectContextToAgent) {
    toast.error("Unavailable", "Sending to the agent is not available here.");
    dismissTerminalQueuePopup();
    return;
  }
  const capture = terminalQueueCapture(text);
  const item: QueueItem = {
    id: crypto.randomUUID(),
    source: "terminal",
    pasteText: buildPasteText(capture),
    meta: {}
  };
  const ok = await injectContextToAgent([item], { sessionId: props.threadId });
  if (ok) {
    terminal?.clearSelection();
    dismissTerminalQueuePopup();
    pendingTerminalText.value = "";
  }
}

async function onGoToTerminalSelectionFile(): Promise<void> {
  const path = pendingTerminalGoToPath.value;
  if (!path || !openWorkspaceFile) {
    dismissTerminalQueuePopup();
    return;
  }
  await openWorkspaceFile(path);
  terminal?.clearSelection();
  dismissTerminalQueuePopup();
  pendingTerminalText.value = "";
}

onBeforeUnmount(() => {
  terminalQueuePointerCleanup?.();
  dropHandlersCleanup?.();
  resizeObserver?.disconnect();
  resizeObserver = null;
  themeObserver?.disconnect();
  themeObserver = null;
  ptyDataDisposer?.();
  ptyDataDisposer = null;
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});

watch(
  () =>
    [
      props.worktreeId,
      props.cwd,
      props.ptyKind,
      props.ptyKind === "shell"
        ? `${props.worktreeId}:${props.shellSlotId}`
        : props.threadId
    ] as const,
  async () => {
    await attachPty();
    if (didCompleteInitialAttach) {
      fit();
      terminal?.focus();
    }
  }
);

/** Bootstrap may be set after the PTY already exists (e.g. inline thread composer → terminal). */
watch(
  () => props.pendingAgentBootstrap,
  () => {
    const boot = props.pendingAgentBootstrap;
    if (!boot?.command.trim()) return;
    if (activeSessionId.value !== boot.threadId) return;
    const mode = boot.mode ?? "prompt";
    if (attachedWithLivePty && mode === "resume") return;
    void tryInjectPendingBootstrap(boot.threadId, attachGeneration);
  },
  { deep: true, flush: "post" }
);

function focusTerminal(): void {
  terminal?.focus();
}

function runResizePass(): void {
  fit();
  applyTheme();
}

/**
 * Refit after the pane becomes visible (e.g. lower terminal tab change). Two animation-frame passes
 * mimic a resize “toggle” so xterm measures non-zero layout after `v-show` turns the pane on.
 */
function refreshTerminal(): void {
  requestAnimationFrame(() => {
    runResizePass();
    requestAnimationFrame(() => {
      runResizePass();
    });
  });
}

defineExpose({ focus: focusTerminal, refresh: refreshTerminal });
</script>

<template>
  <section
    data-instrument-terminal
    class="relative flex bg-background h-full min-h-0 min-w-0 flex-col overflow-hidden px-3 pt-1 pb-0 text-card-foreground text-xs border-t border-border"
    role="document"
    :aria-label="paneAriaLabel"
  >
    <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <div ref="containerRef" class="terminal-pane h-full min-h-0 w-full overflow-hidden" />
    </div>
    <div
      v-show="ptyBusy"
      class="bg-background pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span class="text-sm text-muted-foreground">Starting terminal…</span>
    </div>
    <ContextQueueSelectionPopup
      :visible="terminalQueueVisible"
      :anchor="terminalQueueAnchor"
      :go-to-file-path="pendingTerminalGoToPath"
      @queue="onQueueTerminalSelection"
      @go-to-file="onGoToTerminalSelectionFile"
      @send-to-agent="onInjectTerminalSelectionToAgent"
      @dismiss="dismissTerminalQueuePopup"
    />
  </section>
</template>

<style scoped>
.terminal-pane :deep(.xterm) {
  height: 100%;
  width: 100%;
  padding: 0;
}

.terminal-pane :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
