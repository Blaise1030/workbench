export type CloseConfirmationPrompt = () => Promise<boolean>;

export function buildCloseConfirmationDetail(activeTerminalCount: number, resumeIds: string[]): string {
  const terminalInstanceLabel = activeTerminalCount === 1 ? "instance" : "instances";
  const resumePart = resumeIds.length > 0 ? ` Resume IDs detected: ${resumeIds.join(", ")}.` : "";
  return `You have ${activeTerminalCount} active terminal ${terminalInstanceLabel}.${resumePart} Close is blocked until you click Confirm.`;
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
