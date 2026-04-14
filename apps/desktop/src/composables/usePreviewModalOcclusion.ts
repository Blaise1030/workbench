import { onMounted, onUnmounted } from "vue";

/**
 * Reka-ui Dialog / AlertDialog set `data-state` on portaled content. The preview
 * `BrowserView` is a native sibling above the main page; HTML z-index cannot stack
 * modals above it, so we hide the native layer while any blocking modal is open.
 */
const OPEN_MODAL_SELECTOR =
  '[data-slot="dialog-content"][data-state="open"], [data-slot="alert-dialog-content"][data-state="open"]';

function syncPreviewOcclusion(): void {
  const api = window.previewApi;
  if (!api?.setOccludedByModal) return;
  const occluded = document.querySelector(OPEN_MODAL_SELECTOR) != null;
  void api.setOccludedByModal(occluded);
}

/**
 * Attach once from the workspace shell so settings, confirm dialogs, etc. are not covered
 * by the preview region when the Preview tab has been opened this session.
 */
export function usePreviewModalOcclusion(): void {
  let observer: MutationObserver | null = null;

  onMounted(() => {
    if (!window.previewApi?.setOccludedByModal) return;
    observer = new MutationObserver(() => syncPreviewOcclusion());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"]
    });
    syncPreviewOcclusion();
  });

  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
    void window.previewApi?.setOccludedByModal?.(false);
  });
}
