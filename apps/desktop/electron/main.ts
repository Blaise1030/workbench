import path from "node:path";
import { app, dialog } from "electron";

// In dev mode, use a port-keyed userData directory so each worktree instance
// gets its own ServiceWorker database and SQLite store, avoiding IO conflicts
// with the production app or other concurrent dev instances.
if (process.env.VITE_DEV_SERVER_URL) {
  try {
    const port = new URL(process.env.VITE_DEV_SERVER_URL).port || "dev";
    app.setPath("userData", path.join(app.getPath("appData"), `workbench-dev-${port}`));
  } catch {
    app.setPath("userData", path.join(app.getPath("appData"), "workbench-dev"));
  }
}

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
