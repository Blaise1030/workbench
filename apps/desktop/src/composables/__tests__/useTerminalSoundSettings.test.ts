import { describe, expect, it, beforeEach } from "vitest";
import {
  STORAGE_TERMINAL_NOTIFICATIONS_ENABLED,
  resetTerminalSoundSettingsForTests,
  useTerminalSoundSettings
} from "../useTerminalSoundSettings";

describe("useTerminalSoundSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTerminalSoundSettingsForTests();
  });

  it("defaults to notifications on", () => {
    const { terminalNotificationsEnabled } = useTerminalSoundSettings();
    expect(terminalNotificationsEnabled.value).toBe(true);
  });

  it("persists notifications master toggle", () => {
    const { terminalNotificationsEnabled } = useTerminalSoundSettings();
    terminalNotificationsEnabled.value = false;
    expect(localStorage.getItem(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED)).toBe("0");
  });

  it("reads stored value on init after reset", () => {
    localStorage.setItem(STORAGE_TERMINAL_NOTIFICATIONS_ENABLED, "0");
    resetTerminalSoundSettingsForTests();
    const { terminalNotificationsEnabled } = useTerminalSoundSettings();
    expect(terminalNotificationsEnabled.value).toBe(false);
  });
});
