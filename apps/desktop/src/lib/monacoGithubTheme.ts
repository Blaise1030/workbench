import type * as MonacoApi from "monaco-editor/esm/vs/editor/editor.api";
/** Light: monaco-themes GitHub Light. Dark: Primer github-vscode-theme `themes/dark-default.json` (GitHub Dark Default). */
import githubDarkTheme from "./monaco/github-dark-theme.json";
import githubLightTheme from "./monaco/github-light-theme.json";

export const MONACO_GITHUB_LIGHT = "instrument-github-light";
export const MONACO_GITHUB_DARK = "instrument-github-dark";

function normalizeThemeData(theme: MonacoApi.editor.IStandaloneThemeData): MonacoApi.editor.IStandaloneThemeData {
  const colors: MonacoApi.editor.IColors = {};
  for (const [token, value] of Object.entries(theme.colors ?? {})) {
    if (typeof value === "string") {
      colors[token] = value;
    }
  }

  return {
    ...theme,
    colors,
  };
}

/** Registers GitHub Light + GitHub Dark Default and activates by `html.dark`. */
export function applyMonacoGithubTheme(monaco: typeof MonacoApi): void {
  const isDark = document.documentElement.classList.contains("dark");

  if (typeof monaco.editor.defineTheme === "function") {
    monaco.editor.defineTheme(
      MONACO_GITHUB_LIGHT,
      normalizeThemeData(githubLightTheme as MonacoApi.editor.IStandaloneThemeData)
    );
    monaco.editor.defineTheme(
      MONACO_GITHUB_DARK,
      normalizeThemeData(githubDarkTheme as MonacoApi.editor.IStandaloneThemeData)
    );
    monaco.editor.setTheme(isDark ? MONACO_GITHUB_DARK : MONACO_GITHUB_LIGHT);
  } else {
    monaco.editor.setTheme(isDark ? "vs-dark" : "vs");
  }
}
