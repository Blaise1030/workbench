import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import type { Extension } from "@codemirror/state";

/** Maps `FileSearchEditor` `editorLanguage` ids to CodeMirror language extensions. */
export function languageExtensionsFor(id: string | undefined): Extension[] {
  if (!id || id === "plain") return [];
  switch (id) {
    case "typescript":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ typescript: true, jsx: true })];
    case "javascript":
      return [javascript()];
    case "jsx":
      return [javascript({ jsx: true })];
    case "json":
      return [json()];
    case "css":
    case "scss":
    case "sass":
    case "less":
      return [css()];
    case "html":
    case "vue":
      return [html()];
    case "markdown":
      return [markdown()];
    case "python":
      return [python()];
    case "rust":
      return [rust()];
    case "c":
    case "cpp":
      return [cpp()];
    case "java":
      return [java()];
    case "php":
      return [php()];
    case "sql":
      return [sql()];
    case "xml":
      return [xml()];
    case "yaml":
      return [yaml()];
    case "go":
      return [go()];
    default:
      return [];
  }
}
