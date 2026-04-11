export type Rect = { left: number; top: number; width: number; height: number };

/** Visible viewport (handles pinch-zoom / embedded browser UI) or full window. */
function viewportBox(): { left: number; top: number; width: number; height: number } {
  if (typeof window === "undefined") {
    return { left: 0, top: 0, width: 1024, height: 768 };
  }
  const vv = window.visualViewport;
  if (vv) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: vv.width,
      height: vv.height
    };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** Position popup near selection end; clamp to the visual viewport (fixed positioning). */
export function clampPopupRect(anchor: Rect, popupW: number, popupH: number): { left: number; top: number } {
  const pad = 8;
  const vp = viewportBox();
  const maxRight = vp.left + vp.width - pad;
  const maxBottom = vp.top + vp.height - pad;
  const minLeft = vp.left + pad;
  const minTop = vp.top + pad;

  let left = anchor.left + anchor.width + pad;
  let top = anchor.top + anchor.height + pad;
  if (left + popupW > maxRight) left = Math.max(minLeft, anchor.left - popupW - pad);
  if (top + popupH > maxBottom) top = Math.max(minTop, anchor.top - popupH - pad);
  left = Math.min(Math.max(minLeft, left), maxRight - popupW);
  top = Math.min(Math.max(minTop, top), maxBottom - popupH);
  return { left, top };
}
