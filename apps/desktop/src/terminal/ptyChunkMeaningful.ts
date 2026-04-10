import {
  minMeaningfulCharsForSensitivity,
  type TerminalActivitySensitivity
} from "@/terminal/activitySensitivity";

/**
 * Strip CSI / OSC noise so terminal reflow (e.g. after SIGWINCH from resize) does not count as agent output.
 * Matches the CSI pattern used in `electron/services/workspaceService.ts` for title stripping.
 */
const CSI_SEQUENCE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
/** OSC sequences often end with BEL (e.g. window title). */
const OSC_TO_BEL = /\x1b\][^\x07]*\x07/g;
/** OSC terminated with ST (ESC \\). */
const OSC_TO_ST = /\x1b\][^\x1b\\]*\x1b\\/g;

export function stripTerminalControlNoise(input: string): string {
  return input.replace(/\x07/g, "").replace(CSI_SEQUENCE, "").replace(OSC_TO_BEL, "").replace(OSC_TO_ST, "");
}

/**
 * `\r` without `\n` is typically used for spinner/progress redraws on the current line.
 * Treat those chunks as non-activity so terminal loading UIs do not arm idle attention.
 */
export function isCarriageReturnRedraw(input: string): boolean {
  if (!input.includes("\r") || input.includes("\n")) return false;
  const visible = stripTerminalControlNoise(input)
    .replace(/\r/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  return visible.length > 0;
}

/** True when the chunk has user-visible text, excluding bells and terminal control sequences. */
export function hasMeaningfulPtyOutput(
  data: string,
  sensitivity: TerminalActivitySensitivity = "low"
): boolean {
  if (isCarriageReturnRedraw(data)) return false;
  const cleaned = stripTerminalControlNoise(data)
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= minMeaningfulCharsForSensitivity(sensitivity);
}
