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
