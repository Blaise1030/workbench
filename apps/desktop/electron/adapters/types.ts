import type { ThreadAgent } from "../../src/shared/domain.js";

/** Same union as thread agents — used when starting a PTY-backed run. */
export type AgentKind = ThreadAgent;

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
}
