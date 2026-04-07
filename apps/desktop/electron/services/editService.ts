import fs from "node:fs/promises";
import path from "node:path";

export interface QuickPatchInput {
  cwd: string;
  relativeFilePath: string;
  content: string;
}

export class EditService {
  async applyPatch(input: QuickPatchInput): Promise<void> {
    const target = path.resolve(input.cwd, input.relativeFilePath);
    await fs.writeFile(target, input.content, "utf8");
  }
}
