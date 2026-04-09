export type CloseConfirmationPrompt = () => Promise<boolean>;

export function buildCloseConfirmationDetail(activeTerminalCount: number, resumeIds: string[]): string {
  const terminalInstanceLabel = activeTerminalCount === 1 ? "instance" : "instances";
  if (resumeIds.length === 0) {
    return `You have ${activeTerminalCount} active terminal ${terminalInstanceLabel}. Close is blocked until you click Confirm.`;
  }
  return `You have ${activeTerminalCount} active terminal ${terminalInstanceLabel}. Resume IDs detected: ${resumeIds.join(", ")}. Close is blocked until you click Confirm.`;
}

/**
 * Global app-close policy:
 * - Once a close intent has been confirmed, later attempts are allowed.
 * - Otherwise, ask for explicit confirmation via the provided popup prompt.
 */
export async function shouldAllowAppClose(
  alreadyConfirmed: boolean,
  promptForConfirmation: CloseConfirmationPrompt
): Promise<boolean> {
  if (alreadyConfirmed) return true;
  return promptForConfirmation();
}
