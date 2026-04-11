<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { Loader2 } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    worktreeId: string;
    /** When set, PTY is keyed by thread so each thread has its own shell. */
    threadId: string;
    cwd: string;
    /** After `ptyCreate` for this thread, type `command` + Enter once. */
    pendingAgentBootstrap?: { threadId: string; command: string } | null;
    /**
     * `agent` — one PTY per thread (or worktree fallback). `shell` — extra PTY per worktree slot
     * (see `shellSlotId`), independent of the active thread.
     */
    ptyKind?: "agent" | "shell";
    /** Distinct id for each extra terminal tab (PTY key includes worktree + this). */
    shellSlotId?: string;
  }>(),
  { ptyKind: "agent", shellSlotId: "main" }
);

const emit = defineEmits<{
  bootstrapConsumed: [];
  "user-typed": [sessionId: string];
}>();

const paneAriaLabel = computed(() =>
  props.ptyKind === "shell" ? "Terminal" : "Agent"
);

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

    const { buffer, created } = await api.ptyCreate(sessionId, props.cwd, props.worktreeId);
    if (gen !== attachGeneration) return;

    activeSessionId.value = sessionId;

    if (buffer) {
      terminal.write(buffer);
    }

    ptyDataDisposer = api.onPtyData((id, data) => {
      if (gen !== attachGeneration || id !== sessionId) return;
      terminal?.write(data);
    });

    const boot = props.pendingAgentBootstrap;
    if (
      created === true &&
      boot &&
      boot.command.trim() &&
      sessionId === boot.threadId &&
      gen === attachGeneration
    ) {
      void api.ptyWrite(sessionId, `${boot.command}\r`);
      emit("bootstrapConsumed");
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
});

onBeforeUnmount(() => {
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

function focusTerminal(): void {
  terminal?.focus();
}

function refreshTerminal(): void {
  fit();
  requestAnimationFrame(() => terminal?.scrollToBottom());
}

defineExpose({ focus: focusTerminal, refresh: refreshTerminal });
</script>

<template>
  <section
    data-instrument-terminal
    class="relative flex bg-muted h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card px-3 pt-1 pb-0 text-card-foreground text-xs border-t border-border"
    role="document"
    :aria-label="paneAriaLabel"
  >
    <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <div ref="containerRef" class="terminal-pane h-full min-h-0 w-full overflow-hidden" />
    </div>
    <div
      v-show="ptyBusy"
      class="ui-glass-local pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span class="text-sm text-muted-foreground">Starting terminal…</span>
    </div>
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
