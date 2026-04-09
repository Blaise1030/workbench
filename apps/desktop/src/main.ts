import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initColorSchemeFromStorage } from "./composables/useColorScheme";
import { initUiThemePresetFromStorage } from "./composables/useUiThemePreset";
import "./styles/globals.css";

initColorSchemeFromStorage();
initUiThemePresetFromStorage();

/** Electron opens dropped files in a new window unless the default is prevented; keep custom drop handlers working. */
window.addEventListener("dragover", (e) => {
  e.preventDefault();
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
});

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
