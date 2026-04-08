import { effectScope, ref, watch } from "vue";

/** `1` / `0` in localStorage (matches simple boolean persistence). */
export const STORAGE_TERMINAL_NOTIFICATIONS_ENABLED = "instrument.terminalNotificationsEnabled";

function readBool(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* private mode */
  }
  return defaultValue;
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const terminalNotificationsEnabled = ref(readBool(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, true));

const persistScope = effectScope();
persistScope.run(() => {
  watch(
    terminalNotificationsEnabled,
    (v) => writeBool(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, v),
    { flush: "sync" }
  );
});

/** Re-sync refs from `localStorage` (for tests after mutating storage). */
export function resetTerminalSoundSettingsForTests(): void {
  terminalNotificationsEnabled.value = readBool(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, true);
}

/** Master toggle for terminal attention sounds (bell, background output, idle ping, etc.). */
export function useTerminalSoundSettings(): {
  terminalNotificationsEnabled: typeof terminalNotificationsEnabled;
} {
  return { terminalNotificationsEnabled };
}
