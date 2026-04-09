/**
 * jsdom does not implement ResizeObserver; reka-ui (Popover, etc.) expects it.
 */
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock;
