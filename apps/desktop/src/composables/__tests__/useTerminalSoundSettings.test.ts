import { describe, expect, it, beforeEach } from "vitest";
import {
  STORAGE_TERMINAL_ACTIVITY_SENSITIVITY,
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
    const { terminalNotificationsEnabled, terminalActivitySensitivity } = useTerminalSoundSettings();
    expect(terminalNotificationsEnabled.value).toBe(true);
    expect(terminalActivitySensitivity.value).toBe("medium");
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

  it("persists terminal activity sensitivity", () => {
    const { terminalActivitySensitivity } = useTerminalSoundSettings();
    terminalActivitySensitivity.value = "high";
    expect(localStorage.getItem(STORAGE_TERMINAL_ACTIVITY_SENSITIVITY)).toBe("high");
  });

  it("reads stored activity sensitivity after reset", () => {
    localStorage.setItem(STORAGE_TERMINAL_ACTIVITY_SENSITIVITY, "low");
    resetTerminalSoundSettingsForTests();
    const { terminalActivitySensitivity } = useTerminalSoundSettings();
    expect(terminalActivitySensitivity.value).toBe("low");
  });
});
