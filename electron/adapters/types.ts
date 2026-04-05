export type AgentKind = "codex" | "claude";
export type AdapterRunState = "running" | "needsReview" | "failed" | "done";

export interface AdapterStartInput {
  cwd: string;
  threadId: string;
  prompt: string;
}

export interface AdapterEvent {
  stream: "stdout" | "stderr";
  text: string;
}

export interface AgentAdapter {
  kind: AgentKind;
  command(input: AdapterStartInput): { file: string; args: string[] };
  detectState(chunk: string): AdapterRunState | null;
}
