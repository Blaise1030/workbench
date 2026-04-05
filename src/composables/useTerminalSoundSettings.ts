import { effectScope, ref, watch } from "vue";

/** `1` / `0` in localStorage (matches simple boolean persistence). */
export const STORAGE_TERMINAL_NOTIFICATIONS_ENABLED = "instrument.terminalNotificationsEnabled";
export const STORAGE_TERMINAL_BELL_SOUND = "instrument.terminalBellSound";
export const STORAGE_TERMINAL_BACKGROUND_SOUND = "instrument.terminalBackgroundOutputSound";

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
const terminalBellSound = ref(readBool(STORAGE_TERMINAL_BELL_SOUND, true));
const terminalBackgroundOutputSound = ref(readBool(STORAGE_TERMINAL_BACKGROUND_SOUND, false));

const persistScope = effectScope();
persistScope.run(() => {
  watch(
    terminalNotificationsEnabled,
    (v) => writeBool(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, v),
    { flush: "sync" }
  );
  watch(terminalBellSound, (v) => writeBool(STORAGE_TERMINAL_BELL_SOUND, v), { flush: "sync" });
  watch(terminalBackgroundOutputSound, (v) => writeBool(STORAGE_TERMINAL_BACKGROUND_SOUND, v), {
    flush: "sync"
  });
});

/** Re-sync refs from `localStorage` (for tests after mutating storage). */
export function resetTerminalSoundSettingsForTests(): void {
  terminalNotificationsEnabled.value = readBool(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, true);
  terminalBellSound.value = readBool(STORAGE_TERMINAL_BELL_SOUND, true);
  terminalBackgroundOutputSound.value = readBool(STORAGE_TERMINAL_BACKGROUND_SOUND, false);
}

export function useTerminalSoundSettings(): {
  terminalNotificationsEnabled: typeof terminalNotificationsEnabled;
  terminalBellSound: typeof terminalBellSound;
  terminalBackgroundOutputSound: typeof terminalBackgroundOutputSound;
} {
  return { terminalNotificationsEnabled, terminalBellSound, terminalBackgroundOutputSound };
}
