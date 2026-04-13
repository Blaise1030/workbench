import { shallowRef } from "vue";

/**
 * Viewport Y (CSS px) of the top edge of the preview placeholder where the native
 * `WebContentsView` is stacked above HTML. Used to keep teleported UI (e.g. project tab
 * hover cards) from drawing into the occluded region.
 */
export const previewNativeViewportTopPx = shallowRef<number | null>(null);

export function setPreviewNativeViewportTopPx(y: number | null): void {
  previewNativeViewportTopPx.value = y;
}

/**
 * Invisible `fixed` mirror of the preview viewport (teleported to `body`). Passed as an
 * extra Floating UI `collisionBoundary` so popovers shift/flip away from the native layer
 * even though that layer paints above HTML.
 */
export const previewNativeCollisionEl = shallowRef<HTMLElement | null>(null);

export function setPreviewNativeCollisionEl(el: HTMLElement | null): void {
  previewNativeCollisionEl.value = el;
}
