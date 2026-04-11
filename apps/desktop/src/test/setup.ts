/** Stabilize local-date helpers (thread sidebar date groups, etc.) across developer machines and CI. */
process.env.TZ = "UTC";

/**
 * jsdom does not implement ResizeObserver; reka-ui (Popover, etc.) expects it.
 */
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock;
