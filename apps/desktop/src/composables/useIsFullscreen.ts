import { onMounted, onUnmounted, ref } from "vue";

export function useIsFullscreen() {
  const query = window.matchMedia("(display-mode: fullscreen)");
  const isFullscreen = ref(query.matches);

  function onChange(e: MediaQueryListEvent) {
    isFullscreen.value = e.matches;
  }

  onMounted(() => {
    query.addEventListener("change", onChange);
  });

  onUnmounted(() => {
    query.removeEventListener("change", onChange);
  });

  return { isFullscreen };
}
