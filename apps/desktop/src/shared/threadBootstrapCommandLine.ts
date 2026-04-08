/**
 * Shell-escapes `text` as one double-quoted POSIX argument (for PTY bootstrap lines).
 */
export function shellDoubleQuotedArg(text: string): string {
  return `"${text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")}"`;
}

/**
 * Bootstrap line: `{baseCommand}` or `{baseCommand} "prompt"` when prompt is non-empty.
 * `baseCommand` is the per-agent line from settings (e.g. `claude`, `cursor agent`) — see `useAgentBootstrapCommands`.
 */
export function threadBootstrapCommandLine(baseCommand: string, prompt: string): string {
  const base = baseCommand.trim();
  const t = prompt.trim();
  if (!t) return base;
  return `${base} ${shellDoubleQuotedArg(t)}`;
}
