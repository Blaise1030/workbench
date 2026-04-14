/**
 * Slim Monaco entry: avoids the full `monaco-editor` package barrel (pulls every
 * language tokenizer into whatever chunk imports it). `editor.api` + `editor.all`
 * stay in the dedicated `monaco-editor` manual chunk from `vite.config.ts`.
 *
 * `basic-languages/monaco.contribution` registers built-in grammars (typescript, html,
 * etc.); without it, `setModelLanguage` has no tokenization.
 * @see https://github.com/vdesjs/vite-plugin-monaco-editor#using
 */
import "monaco-editor/esm/vs/editor/editor.all.js";
import "monaco-editor/esm/vs/basic-languages/monaco.contribution.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export { monaco };
