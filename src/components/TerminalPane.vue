<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { ref } from "vue";

const props = defineProps<{
  worktreeId: string;
  cwd: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let ptyDataDisposer: (() => void) | null = null;

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
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

async function attachPty(worktreeId: string, cwd: string): Promise<void> {
  const api = getApi();
  if (!api || !terminal) return;

  // Detach previous listener
  ptyDataDisposer?.();
  ptyDataDisposer = null;

  terminal.reset();

  const { buffer } = await api.ptyCreate(worktreeId, cwd);
  if (buffer) {
    terminal.write(buffer);
  }

  ptyDataDisposer = api.onPtyData((wid, data) => {
    if (wid === worktreeId) terminal?.write(data);
  });
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
      api.ptyWrite(props.worktreeId, data);
    });
    terminal.onResize(({ cols, rows }) => {
      api.ptyResize(props.worktreeId, cols, rows);
    });
  }

  resizeObserver = new ResizeObserver(() => {
    fit();
    applyTheme();
  });
  resizeObserver.observe(el);

  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  await attachPty(props.worktreeId, props.cwd);
});

onBeforeUnmount(() => {
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
  () => props.worktreeId,
  async (newId) => {
    await attachPty(newId, props.cwd);
  }
);
</script>

<template>
  <section
    ref="containerRef"
    class="terminal-pane h-full min-h-0 min-w-0 overflow-hidden bg-card p-3 text-card-foreground text-xs"
    role="document"
    aria-label="Terminal"
  />
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
