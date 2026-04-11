import { afterEach, describe, expect, it } from "vitest";
import { clampPopupRect } from "@/lib/contextQueueAnchor";

describe("clampPopupRect", () => {
  const origInnerWidth = window.innerWidth;
  const origInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: origInnerWidth,
      writable: true,
      configurable: true
    });
    Object.defineProperty(window, "innerHeight", {
      value: origInnerHeight,
      writable: true,
      configurable: true
    });
  });

  it("places popup to the right and below the anchor when there is room", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 500, configurable: true });
    const anchor = { left: 10, top: 10, width: 5, height: 5 };
    expect(clampPopupRect(anchor, 100, 50)).toEqual({ left: 23, top: 23 });
  });

  it("moves popup to the left when it would overflow the right edge", () => {
    Object.defineProperty(window, "innerWidth", { value: 200, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 500, configurable: true });
    const anchor = { left: 150, top: 10, width: 10, height: 5 };
    expect(clampPopupRect(anchor, 120, 40)).toEqual({ left: 22, top: 23 });
  });

  it("moves popup upward when it would overflow the bottom edge", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 100, configurable: true });
    const anchor = { left: 10, top: 80, width: 5, height: 5 };
    expect(clampPopupRect(anchor, 120, 40)).toEqual({ left: 23, top: 32 });
  });
});
