import { effectScope, onMounted, ref, watch } from "vue";

export const COLOR_SCHEME_STORAGE_KEY = "instrument-color-scheme";

export type ColorSchemePreference = "light" | "dark" | "system";

function isValidPreference(value: string | null): value is ColorSchemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredPreference(): ColorSchemePreference {
  try {
    const raw = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (isValidPreference(raw)) return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return "system";
}

function resolveIsDark(preference: ColorSchemePreference): boolean {
  if (preference === "dark") return true;
  if (preference === "light") return false;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply `.dark` on `<html>`; call before first paint and whenever preference changes. */
export function applyColorSchemeDocumentClass(preference: ColorSchemePreference): void {
  document.documentElement.classList.toggle("dark", resolveIsDark(preference));
}

/** Synchronous init for `main.ts` / inline boot script. */
export function initColorSchemeFromStorage(): ColorSchemePreference {
  const preference = readStoredPreference();
  applyColorSchemeDocumentClass(preference);
  return preference;
}

const preference = ref<ColorSchemePreference>(readStoredPreference());

/** App-lifetime scope so this watch survives ThemeToggle unmount/remount (e.g. empty state → tabs). */
const colorSchemePersistenceScope = effectScope();
colorSchemePersistenceScope.run(() => {
  watch(
    preference,
    (next) => {
      try {
        localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      applyColorSchemeDocumentClass(next);
    },
    { flush: "sync" }
  );
});

let systemListenerAttached = false;

function attachSystemPreferenceListener(): void {
  if (systemListenerAttached || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  systemListenerAttached = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (preference.value === "system") applyColorSchemeDocumentClass("system");
  });
}

export function useColorScheme() {
  onMounted(() => {
    preference.value = readStoredPreference();
    applyColorSchemeDocumentClass(preference.value);
    attachSystemPreferenceListener();
  });

  function setPreference(next: ColorSchemePreference): void {
    preference.value = next;
  }

  function cycle(): void {
    const order: ColorSchemePreference[] = ["light", "dark", "system"];
    const i = order.indexOf(preference.value);
    preference.value = order[(i + 1) % order.length]!;
  }

  return { preference, setPreference, cycle };
}
