import { describe, expect, it, beforeEach } from "vitest";
import {
  STORAGE_TERMINAL_BACKGROUND_SOUND,
  STORAGE_TERMINAL_BELL_SOUND,
  resetTerminalSoundSettingsForTests,
  useTerminalSoundSettings
} from "../useTerminalSoundSettings";

describe("useTerminalSoundSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTerminalSoundSettingsForTests();
  });

  it("defaults to bell on and background off", () => {
    const { terminalBellSound, terminalBackgroundOutputSound } = useTerminalSoundSettings();
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

  it("reads stored values on init after reset", () => {
    localStorage.setItem(STORAGE_TERMINAL_BELL_SOUND, "0");
    localStorage.setItem(STORAGE_TERMINAL_BACKGROUND_SOUND, "1");
    resetTerminalSoundSettingsForTests();
    const { terminalBellSound, terminalBackgroundOutputSound } = useTerminalSoundSettings();
    expect(terminalBellSound.value).toBe(false);
    expect(terminalBackgroundOutputSound.value).toBe(true);
  });
});
