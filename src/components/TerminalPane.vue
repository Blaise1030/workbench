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
    /** When this matches the session thread id after `ptyCreate`, send `agents` + Enter once. */
    pendingAgentsThreadId?: string | null;
    /**
     * `agent` — one PTY per thread (or worktree fallback). `shell` — one shared PTY per worktree
     * for a general terminal, independent of the active thread.
     */
    ptyKind?: "agent" | "shell";
  }>(),
  { ptyKind: "agent" }
);

const emit = defineEmits<{
  autoAgentsConsumed: [];
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

function ptySessionId(): string {
  if (props.ptyKind === "shell") {
    return `__shell:${props.worktreeId}`;
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

    const { buffer } = await api.ptyCreate(sessionId, props.cwd, props.worktreeId);
    if (gen !== attachGeneration) return;

    activeSessionId.value = sessionId;

    if (buffer) {
      terminal.write(buffer);
    }

    ptyDataDisposer = api.onPtyData((id, data) => {
      if (gen !== attachGeneration || id !== sessionId) return;
      terminal?.write(data);
    });

    if (
      props.pendingAgentsThreadId &&
      sessionId === props.pendingAgentsThreadId &&
      gen === attachGeneration
    ) {
      void api.ptyWrite(sessionId, "agents\r");
      emit("autoAgentsConsumed");
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
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.35,
    cursorBlink: true,
    cursorStyle: "block",
    convertEol: false,
    disableStdin: false
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(el);
  applyTheme();
  fit();

  const api = getApi();
  if (api) {
    terminal.onData((data) => {
      const sid = activeSessionId.value;
      if (sid) void api.ptyWrite(sid, data);
    });
    terminal.onResize(({ cols, rows }) => {
      const sid = activeSessionId.value;
      if (sid) void api.ptyResize(sid, cols, rows);
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
      props.ptyKind === "shell" ? props.worktreeId : props.threadId
    ] as const,
  async () => {
    await attachPty();
    if (didCompleteInitialAttach) {
      fit();
      terminal?.focus();
    }
  }
);
</script>

<template>
  <section
    class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card p-3 text-card-foreground text-xs"
    role="document"
    :aria-label="paneAriaLabel"
  >
    <div ref="containerRef" class="terminal-pane min-h-0 flex-1 overflow-hidden" />
    <div
      v-show="ptyBusy"
      class="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-card/85 backdrop-blur-[1px]"
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
