import { BrowserView, BrowserWindow, type Event, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "./ipcChannels.js";
import type { PreviewBounds, PreviewDevToolsToggleResult, PreviewNavigationState } from "../src/shared/ipc.js";

let previewPageView: BrowserView | null = null;
let lastBounds: PreviewBounds | null = null;
let lastWin: BrowserWindow | null = null;
/** Tracks whether we toggled DevTools on (also cleared when DevTools closes). */
let embeddedDevToolsOpen = false;
/** URL currently loaded in the BrowserView (persists across detach/re-attach). */
let lastLoadedUrl: string | null = null;

function notifyEmbeddedDevtoolsState(win: BrowserWindow | null, open: boolean): void {
  win?.webContents.send(IPC_CHANNELS.previewEmbeddedDevtoolsState, { open });
}

function notifyNavigationUrl(win: BrowserWindow | null, url: string): void {
  const wc = previewPageView?.webContents;
  win?.webContents.send(IPC_CHANNELS.previewNavigationUrl, {
    url,
    canGoBack: wc?.navigationHistory.canGoBack() ?? false,
    canGoForward: wc?.navigationHistory.canGoForward() ?? false
  });
}

function getOrCreatePreviewPageView(): BrowserView {
  if (!previewPageView) {
    previewPageView = new BrowserView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    previewPageView.webContents.on("devtools-closed", () => {
      syncEmbeddedDevtoolsClosedFromChrome();
    });
    previewPageView.webContents.on("did-navigate", (_event, url) => {
      notifyNavigationUrl(lastWin, url);
    });
    previewPageView.webContents.on("did-navigate-in-page", (_event, url) => {
      notifyNavigationUrl(lastWin, url);
    });
  }
  return previewPageView;
}

function isSafePreviewUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

/** DevTools UI closed (Chrome X, menu, or our toggle). Keep renderer toggle state in sync. */
function syncEmbeddedDevtoolsClosedFromChrome(): void {
  embeddedDevToolsOpen = false;
  notifyEmbeddedDevtoolsState(lastWin, false);
}

/**
 * One preview `BrowserView` fills the preview rect. DevTools dock **inside** that view
 * (`openDevTools({ mode: 'bottom' })`) so Chromium does not also reserve a bottom strip
 * in the page *and* show a second DevTools surface (duplicate device toolbar / “2 webviews”).
 */
function applyPreviewLayout(): void {
  const win = lastWin;
  const page = previewPageView;
  if (!win || !page || !lastBounds) return;
  const b = lastBounds;
  if (b.width < 2 || b.height < 2) return;
  if (!win.getBrowserViews().includes(page)) win.addBrowserView(page);
  page.setBounds(b);
}

function detachAllPreviewViewsFromWindow(win: BrowserWindow | null): void {
  const hadDevtoolsUi = embeddedDevToolsOpen || !!previewPageView?.webContents.isDevToolsOpened();
  embeddedDevToolsOpen = false;
  if (previewPageView?.webContents.isDevToolsOpened()) {
    try {
      previewPageView.webContents.closeDevTools();
    } catch {
      /* ignore */
    }
  }
  if (!win) return;
  if (previewPageView && win.getBrowserViews().includes(previewPageView)) {
    win.removeBrowserView(previewPageView);
  }
  if (hadDevtoolsUi) notifyEmbeddedDevtoolsState(win, false);
}

function attachPageViewToWindow(win: BrowserWindow): BrowserView {
  const view = getOrCreatePreviewPageView();
  lastWin = win;
  if (!win.getBrowserViews().includes(view)) {
    win.addBrowserView(view);
  }
  applyPreviewLayout();
  return view;
}

export function previewNativeSetBounds(event: IpcMainInvokeEvent, bounds: unknown): void {
  const win = windowFromEvent(event);
  if (!win) return;
  if (typeof bounds !== "object" || bounds === null) return;
  const b = bounds as Record<string, unknown>;
  const x = Math.round(Number(b.x));
  const y = Math.round(Number(b.y));
  const width = Math.round(Number(b.width));
  const height = Math.round(Number(b.height));
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return;
  lastBounds = { x, y, width, height };
  lastWin = win;
  if (width < 2 || height < 2) {
    detachAllPreviewViewsFromWindow(win);
    return;
  }
  if (!previewPageView) return;
  applyPreviewLayout();
}

export function previewNativeDetach(event: IpcMainInvokeEvent): void {
  const win = windowFromEvent(event);
  detachAllPreviewViewsFromWindow(win);
  lastWin = null;
}

export async function previewNativeLoadUrl(
  event: IpcMainInvokeEvent,
  url: unknown
): Promise<{ ok: true } | { ok: false; errorCode: number; errorDescription: string }> {
  if (typeof url !== "string" || !isSafePreviewUrl(url)) {
    return { ok: false, errorCode: -1, errorDescription: "Invalid preview URL" };
  }
  const win = windowFromEvent(event);
  if (!win) return { ok: false, errorCode: -1, errorDescription: "No BrowserWindow" };
  // If the URL is already loaded in the BrowserView, just re-attach without reloading.
  if (url === lastLoadedUrl && previewPageView) {
    attachPageViewToWindow(win);
    return { ok: true };
  }
  const view = attachPageViewToWindow(win);
  const wc = view.webContents;
  return await new Promise((resolve) => {
    const cleanup = (): void => {
      wc.removeListener("did-finish-load", onFinish);
      wc.removeListener("did-fail-load", onFail);
    };
    const onFinish = (): void => {
      cleanup();
      lastLoadedUrl = url;
      resolve({ ok: true });
    };
    const onFail = (
      _event: Event,
      errorCode: number,
      errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) return;
      cleanup();
      resolve({ ok: false, errorCode, errorDescription });
    };
    wc.once("did-finish-load", onFinish);
    wc.once("did-fail-load", onFail);
    void wc.loadURL(url).catch((e: unknown) => {
      cleanup();
      resolve({ ok: false, errorCode: -2, errorDescription: String(e) });
    });
  });
}

export async function previewNativeReload(
  event: IpcMainInvokeEvent
): Promise<{ ok: true } | { ok: false; errorCode: number; errorDescription: string }> {
  const win = windowFromEvent(event);
  const view = previewPageView;
  if (!win || !view) {
    return { ok: false, errorCode: -1, errorDescription: "No preview BrowserView" };
  }
  lastWin = win;
  if (!win.getBrowserViews().includes(view)) {
    win.addBrowserView(view);
  }
  applyPreviewLayout();
  const wc = view.webContents;
  return await new Promise((resolve) => {
    const cleanup = (): void => {
      wc.removeListener("did-finish-load", onFinish);
      wc.removeListener("did-fail-load", onFail);
    };
    const onFinish = (): void => {
      cleanup();
      resolve({ ok: true });
    };
    const onFail = (
      _event: Event,
      errorCode: number,
      errorDescription: string,
      _validatedURL: string,
      isMainFrame: boolean
    ): void => {
      if (!isMainFrame) return;
      cleanup();
      resolve({ ok: false, errorCode, errorDescription });
    };
    wc.once("did-finish-load", onFinish);
    wc.once("did-fail-load", onFail);
    wc.reload();
  });
}

export function previewNativeGoBack(event: IpcMainInvokeEvent): void {
  const win = windowFromEvent(event);
  if (!previewPageView) return;
  const wc = previewPageView.webContents;
  if (wc.navigationHistory.canGoBack()) {
    wc.navigationHistory.goBack();
  }
  notifyNavigationState(win);
}

export function previewNativeGoForward(event: IpcMainInvokeEvent): void {
  const win = windowFromEvent(event);
  if (!previewPageView) return;
  const wc = previewPageView.webContents;
  if (wc.navigationHistory.canGoForward()) {
    wc.navigationHistory.goForward();
  }
  notifyNavigationState(win);
}

export function previewNativeToggleEmbeddedDevTools(event: IpcMainInvokeEvent): PreviewDevToolsToggleResult {
  const win = windowFromEvent(event);
  if (!win) return { ok: false, reason: "no-window" };
  const page = previewPageView;
  if (!page) return { ok: false, reason: "no-preview" };
  if (!lastBounds || lastBounds.width < 2 || lastBounds.height < 2) {
    return { ok: false, reason: "no-bounds" };
  }
  lastWin = win;

  if (embeddedDevToolsOpen || page.webContents.isDevToolsOpened()) {
    page.webContents.closeDevTools();
    syncEmbeddedDevtoolsClosedFromChrome();
    applyPreviewLayout();
    return { ok: true, open: false };
  }

  embeddedDevToolsOpen = true;
  applyPreviewLayout();
  // Dock DevTools *inside* this BrowserView only (no second BrowserView + setDevToolsWebContents),
  // otherwise Chromium can show device mode / dock UI twice (looked like “2 webviews”).
  page.webContents.openDevTools({ mode: "bottom", activate: true });
  return { ok: true, open: true };
}

export function previewNativeGoBack(_event: IpcMainInvokeEvent): void {
  const wc = previewPageView?.webContents;
  if (!wc?.navigationHistory.canGoBack()) return;
  wc.navigationHistory.goBack();
}

export function previewNativeGoForward(_event: IpcMainInvokeEvent): void {
  const wc = previewPageView?.webContents;
  if (!wc?.navigationHistory.canGoForward()) return;
  wc.navigationHistory.goForward();
}
