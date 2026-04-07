import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    tailwindcss(),
    vue()
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
});
