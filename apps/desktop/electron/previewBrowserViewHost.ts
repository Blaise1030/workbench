import { BrowserView, BrowserWindow, type Event, type IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "./ipcChannels.js";
import type { PreviewBounds, PreviewDevToolsToggleResult } from "../src/shared/ipc.js";

/** Fraction of preview viewport height for the page when embedded DevTools is open. */
const PREVIEW_PAGE_HEIGHT_FRACTION = 0.52;
const MIN_PAGE_HEIGHT_PX = 80;
/** Leave enough room for Chrome DevTools’ own toolbar (device toggle, ⋮, dock controls). */
const MIN_DEVTOOLS_HEIGHT_PX = 200;

let previewPageView: BrowserView | null = null;
/** Hosts Chrome DevTools UI for the preview page (`setDevToolsWebContents`). */
let previewDevToolsHostView: BrowserView | null = null;
let lastBounds: PreviewBounds | null = null;
let lastWin: BrowserWindow | null = null;
let embeddedDevToolsOpen = false;

function notifyEmbeddedDevtoolsState(win: BrowserWindow | null, open: boolean): void {
  win?.webContents.send(IPC_CHANNELS.previewEmbeddedDevtoolsState, { open });
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
      removeEmbeddedDevToolsChrome();
    });
  }
  return previewPageView;
}

function getOrCreateDevToolsHostView(): BrowserView {
  if (!previewDevToolsHostView) {
    previewDevToolsHostView = new BrowserView({
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: true
      }
    });
  }
  return previewDevToolsHostView;
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

function removeEmbeddedDevToolsChrome(): void {
  if (!embeddedDevToolsOpen) return;
  embeddedDevToolsOpen = false;
  const win = lastWin;
  const dt = previewDevToolsHostView;
  if (dt && win?.getBrowserViews().includes(dt)) {
    win.removeBrowserView(dt);
  }
  const page = previewPageView;
  if (page && lastBounds && lastBounds.width >= 2 && lastBounds.height >= 2) {
    page.setBounds(lastBounds);
  }
  notifyEmbeddedDevtoolsState(win, false);
}

/** Re-stack: DevTools host below, page on top (last added), for correct hit-testing in non-overlapping rects. */
function restackPreviewBrowserViews(win: BrowserWindow): void {
  const page = previewPageView;
  const dt = previewDevToolsHostView;
  if (!page) return;
  if (dt && win.getBrowserViews().includes(dt)) win.removeBrowserView(dt);
  if (win.getBrowserViews().includes(page)) win.removeBrowserView(page);
  if (dt && embeddedDevToolsOpen) win.addBrowserView(dt);
  win.addBrowserView(page);
}

function applyPreviewLayout(): void {
  const win = lastWin;
  const page = previewPageView;
  if (!win || !page || !lastBounds) return;
  const b = lastBounds;
  if (b.width < 2 || b.height < 2) return;

  if (embeddedDevToolsOpen && previewDevToolsHostView) {
    restackPreviewBrowserViews(win);
    const dt = previewDevToolsHostView;
    let pageH = Math.floor(b.height * PREVIEW_PAGE_HEIGHT_FRACTION);
    pageH = Math.max(MIN_PAGE_HEIGHT_PX, Math.min(pageH, b.height - MIN_DEVTOOLS_HEIGHT_PX));
    const dtH = b.height - pageH;
    page.setBounds({ x: b.x, y: b.y, width: b.width, height: pageH });
    dt.setBounds({ x: b.x, y: b.y + pageH, width: b.width, height: dtH });
  } else {
    if (!win.getBrowserViews().includes(page)) win.addBrowserView(page);
    page.setBounds(b);
  }
}

function detachAllPreviewViewsFromWindow(win: BrowserWindow | null): void {
  const hadEmbedded = embeddedDevToolsOpen;
  embeddedDevToolsOpen = false;
  if (previewPageView?.webContents.isDevToolsOpened()) {
    try {
      previewPageView.webContents.closeDevTools();
    } catch {
      /* ignore */
    }
  }
  if (!win) return;
  if (previewDevToolsHostView && win.getBrowserViews().includes(previewDevToolsHostView)) {
    win.removeBrowserView(previewDevToolsHostView);
  }
  if (previewPageView && win.getBrowserViews().includes(previewPageView)) {
    win.removeBrowserView(previewPageView);
  }
  if (hadEmbedded) notifyEmbeddedDevtoolsState(win, false);
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
  const view = attachPageViewToWindow(win);
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

export function previewNativeToggleEmbeddedDevTools(event: IpcMainInvokeEvent): PreviewDevToolsToggleResult {
  const win = windowFromEvent(event);
  if (!win) return { ok: false, reason: "no-window" };
  const page = previewPageView;
  if (!page) return { ok: false, reason: "no-preview" };
  if (!lastBounds || lastBounds.width < 2 || lastBounds.height < 2) {
    return { ok: false, reason: "no-bounds" };
  }
  lastWin = win;

  if (embeddedDevToolsOpen) {
    page.webContents.closeDevTools();
    removeEmbeddedDevToolsChrome();
    applyPreviewLayout();
    return { ok: true, open: false };
  }

  embeddedDevToolsOpen = true;
  const dt = getOrCreateDevToolsHostView();
  page.webContents.setDevToolsWebContents(dt.webContents);
  restackPreviewBrowserViews(win);
  applyPreviewLayout();
  // `detach` / undocked DevTools break the device toolbar in Electron (see electron#28463).
  // `bottom` is treated as docked so Chrome's device toggle and ⋮ → Dock side work reliably.
  page.webContents.openDevTools({ mode: "bottom", activate: true });
  return { ok: true, open: true };
}
