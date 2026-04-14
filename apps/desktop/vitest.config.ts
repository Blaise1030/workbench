import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      shadcn: fileURLToPath(new URL("./shadcn", import.meta.url)),
      // monaco-editor only declares `module`; Vite 6 package entry resolution needs a concrete file.
      "monaco-editor": fileURLToPath(
        new URL("./node_modules/monaco-editor/esm/vs/editor/editor.main.js", import.meta.url)
      )
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./src/test/setup.ts", import.meta.url))],
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"]
  }
});
