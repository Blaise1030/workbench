import fs from "node:fs/promises";
import { assertPathWithinRoot } from "../utils/pathGuard.js";

export interface QuickPatchInput {
  cwd: string;
  relativeFilePath: string;
  content: string;
}

export class EditService {
  async applyPatch(input: QuickPatchInput): Promise<void> {
    const target = assertPathWithinRoot(input.cwd, input.relativeFilePath);
    await fs.writeFile(target, input.content, "utf8");
  }
}
