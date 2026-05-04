import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../src/shared/ipc.js";
import type { MarkNotificationReadInput } from "../../src/shared/ipc.js";
import type { NotificationStore } from "./notificationStore.js";

export function registerNotificationIpc(
  store: NotificationStore,
  getWindows: () => BrowserWindow[]
): void {
  ipcMain.handle(IPC_CHANNELS.notificationsGet, () => store.list());
  ipcMain.handle(IPC_CHANNELS.notificationsMarkRead, (_, payload: MarkNotificationReadInput) => {
    store.markRead(payload.id);
    emitNotificationsDidChange(getWindows);
  });
  ipcMain.handle(IPC_CHANNELS.notificationsMarkAllRead, () => {
    store.markAllRead();
    emitNotificationsDidChange(getWindows);
  });
}

export function emitNotificationsDidChange(getWindows: () => BrowserWindow[]): void {
  for (const win of getWindows()) {
    win.webContents.send(IPC_CHANNELS.notificationsDidChange);
  }
}
