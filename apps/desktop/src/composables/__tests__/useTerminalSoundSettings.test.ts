import { describe, expect, it, beforeEach } from "vitest";
import {
  STORAGE_TERMINAL_BACKGROUND_SOUND,
  STORAGE_TERMINAL_BELL_SOUND,
  STORAGE_TERMINAL_NOTIFICATIONS_ENABLED,
  resetTerminalSoundSettingsForTests,
  useTerminalSoundSettings
} from "../useTerminalSoundSettings";

describe("useTerminalSoundSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTerminalSoundSettingsForTests();
  });

  it("defaults to notifications on, bell on, background off", () => {
    const { terminalNotificationsEnabled, terminalBellSound, terminalBackgroundOutputSound } =
      useTerminalSoundSettings();
    expect(terminalNotificationsEnabled.value).toBe(true);
    expect(terminalBellSound.value).toBe(true);
    expect(terminalBackgroundOutputSound.value).toBe(false);
  });

  it("persists bell to localStorage", () => {
    const { terminalBellSound } = useTerminalSoundSettings();
    terminalBellSound.value = false;
    expect(localStorage.getItem(STORAGE_TERMINAL_BELL_SOUND)).toBe("0");
    terminalBellSound.value = true;
    expect(localStorage.getItem(STORAGE_TERMINAL_BELL_SOUND)).toBe("1");
  });

  it("persists background to localStorage", () => {
    const { terminalBackgroundOutputSound } = useTerminalSoundSettings();
    terminalBackgroundOutputSound.value = true;
    expect(localStorage.getItem(STORAGE_TERMINAL_BACKGROUND_SOUND)).toBe("1");
  });

  it("persists notifications master toggle", () => {
    const { terminalNotificationsEnabled } = useTerminalSoundSettings();
    terminalNotificationsEnabled.value = false;
    expect(localStorage.getItem(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED)).toBe("0");
  });

  it("reads stored values on init after reset", () => {
    localStorage.setItem(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, "0");
    localStorage.setItem(STORAGE_TERMINAL_BELL_SOUND, "0");
    localStorage.setItem(STORAGE_TERMINAL_BACKGROUND_SOUND, "1");
    resetTerminalSoundSettingsForTests();
    const { terminalNotificationsEnabled, terminalBellSound, terminalBackgroundOutputSound } =
      useTerminalSoundSettings();
    expect(terminalNotificationsEnabled.value).toBe(false);
    expect(terminalBellSound.value).toBe(false);
    expect(terminalBackgroundOutputSound.value).toBe(true);
  });
});
