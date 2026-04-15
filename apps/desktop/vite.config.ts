import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type PluginOption } from "vite";

// When running from inside a git worktree, runViteDev.cjs passes WORKTREE_ROOT (the absolute
// path to this worktree's root). Use it to scope watch.ignored to sibling worktrees only,
// so HMR still fires for our own source files.
const worktreeRoot = process.env.WORKTREE_ROOT ?? null;

function buildWatchIgnored(): (string | ((f: string) => boolean))[] {
  if (worktreeRoot) {
    return [
      (f: string) => f.includes("/.worktrees/") && !f.startsWith(worktreeRoot),
      "**/.claude/worktrees/**"
    ];
  }
  return ["**/.worktrees/**", "**/.claude/worktrees/**"];
}

const analyze = process.env.ANALYZE === "1";

export default defineConfig(async () => {
  const { visualizer } = analyze
    ? await import("rollup-plugin-visualizer")
    : { visualizer: null as never };

  return {
  base: "./",
  plugins: [
    tailwindcss(),
    vue(),
    await import("vite-plugin-monaco-editor").then((m) => {
      const factory =
        typeof m.default === "function"
          ? m.default
          : (m.default as { default: (opts: unknown) => PluginOption }).default;
      return factory({
        languageWorkers: ["editorWorkerService", "typescript", "json", "css", "html"]
      }) as PluginOption;
    }),
    ...(analyze
      ? [
          visualizer({
            filename: fileURLToPath(new URL("./bundle-stats/report.md", import.meta.url)),
            template: "markdown",
            gzipSize: true,
            brotliSize: true,
            open: false
          }) as PluginOption,
          visualizer({
            filename: fileURLToPath(new URL("./bundle-stats/bundle.html", import.meta.url)),
            template: "treemap",
            gzipSize: true,
            brotliSize: true,
            open: false
          }) as PluginOption
        ]
      : [])
  ],
  server: {
    watch: {
      // Ignore git worktree checkouts — they duplicate the source tree and cause
      // ENOENT crashes when deleted while Vite's file watcher is still active.
      // When running from inside a worktree, only ignore sibling worktrees so that
      // HMR still fires for our own source files.
      ignored: buildWatchIgnored()
    }
  },
  build: {
    // Must match `loadFile` in electron/mainApp.ts (../dist from dist-electron/electron).
    outDir: "dist-electron/dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor")) {
            return "monaco-editor";
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      shadcn: fileURLToPath(new URL("./shadcn", import.meta.url))
    }
  }
  };
});
