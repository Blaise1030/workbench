import { onMounted, onUnmounted, ref } from "vue";

export function useIsFullscreen() {
  const isFullscreen = ref(false);

  onMounted(() => {
    const unlisten = window.workspaceApi?.onWindowFullscreenChanged?.((value) => {
      isFullscreen.value = value;
    });
    onUnmounted(() => unlisten?.());
  });

  return { isFullscreen };
}
