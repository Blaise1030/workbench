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

/** True when the chunk has user-visible text, excluding bells and terminal control sequences. */
export function hasMeaningfulPtyOutput(data: string): boolean {
  return stripTerminalControlNoise(data).replace(/\s+/g, " ").trim().length > 0;
}
