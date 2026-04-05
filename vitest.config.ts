import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      shadcn: fileURLToPath(new URL("./shadcn", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"]
  }
});
