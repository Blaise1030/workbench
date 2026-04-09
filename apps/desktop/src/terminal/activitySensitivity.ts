export type TerminalActivitySensitivity = "low" | "medium" | "high";

export const DEFAULT_TERMINAL_ACTIVITY_SENSITIVITY: TerminalActivitySensitivity = "medium";

export function normalizeTerminalActivitySensitivity(
  value: unknown,
  fallback: TerminalActivitySensitivity = DEFAULT_TERMINAL_ACTIVITY_SENSITIVITY
): TerminalActivitySensitivity {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "low" || s === "medium" || s === "high") return s;
  return fallback;
}

export function minMeaningfulCharsForSensitivity(
  sensitivity: TerminalActivitySensitivity
): number {
  if (sensitivity === "low") return 1;
  if (sensitivity === "high") return 12;
  return 4;
}
