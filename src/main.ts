import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initColorSchemeFromStorage } from "./composables/useColorScheme";
import { initUiThemePresetFromStorage } from "./composables/useUiThemePreset";
import "./styles/globals.css";

initColorSchemeFromStorage();
initUiThemePresetFromStorage();

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
