export type Rect = { left: number; top: number; width: number; height: number };

/** Position popup near selection end; clamp to viewport. */
export function clampPopupRect(anchor: Rect, popupW: number, popupH: number): { left: number; top: number } {
  const pad = 8;
  let left = anchor.left + anchor.width + pad;
  let top = anchor.top + anchor.height + pad;
  if (left + popupW > window.innerWidth - pad) left = Math.max(pad, anchor.left - popupW - pad);
  if (top + popupH > window.innerHeight - pad) top = Math.max(pad, anchor.top - popupH - pad);
  return { left, top };
}
