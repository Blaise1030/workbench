import type { ResumeIdAdapter } from "./types.js";
import { extractResumeIdFromStdout } from "./resumeIdCapture.js";

export class CursorCliAdapter implements ResumeIdAdapter {
  readonly provider = "cursor" as const;

  detectResumeId(chunk: string): string | null {
    return extractResumeIdFromStdout(chunk);
  }
}
