import { app, dialog } from "electron";

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

void app.whenReady().then(async () => {
  try {
    await import("./mainApp.js");
  } catch (err: unknown) {
    console.error("[electron] Startup failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const hint =
      /NODE_MODULE_VERSION|compiled against a different Node/i.test(message) ||
      /\.node\b/i.test(message)
        ? "\n\nRun: pnpm rebuild:natives"
        : "";
    dialog.showErrorBox("workbench. could not start", `${message}${hint}`);
    app.quit();
  }
});
