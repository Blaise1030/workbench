import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type PluginOption } from "vite";

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
      ignored: ["**/.worktrees/**", "**/.claude/worktrees/**"]
    }
  },
  build: {
    // Must match `loadFile` in electron/mainApp.ts (../dist from dist-electron/electron).
    outDir: "dist-electron/dist",
    emptyOutDir: true
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
