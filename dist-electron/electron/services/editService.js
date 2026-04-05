"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditService = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
class EditService {
    async applyPatch(input) {
        const target = node_path_1.default.resolve(input.cwd, input.relativeFilePath);
        await promises_1.default.writeFile(target, input.content, "utf8");
    }
}
exports.EditService = EditService;
