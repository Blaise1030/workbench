import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { initColorSchemeFromStorage } from "./composables/useColorScheme";
import "./styles/globals.css";

initColorSchemeFromStorage();

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
