/** Map a file path to a Monaco editor language ID. */
export function monacoLanguageIdFromPath(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  const ext = path.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    vue: "html",
    json: "json",
    jsonc: "json",
    md: "markdown",
    markdown: "markdown",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    sql: "sql",
    graphql: "graphql",
    toml: "ini"
  };
  return map[ext] ?? "plaintext";
}
