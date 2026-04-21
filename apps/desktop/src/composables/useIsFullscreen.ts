import { onMounted, onUnmounted, ref } from "vue";

export function useIsFullscreen() {
  const isFullscreen = ref(false);

  function check() {
    isFullscreen.value = window.outerHeight >= screen.height;
  }

  onMounted(() => {
    check();
    window.addEventListener("resize", check);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", check);
  });

  return { isFullscreen };
}
