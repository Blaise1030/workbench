import type * as MonacoApi from "monaco-editor/esm/vs/editor/editor.api";

export const MONACO_INSTRUMENT_THEME = "instrument-shadcn";

/**
 * Convert any CSS color string to #rrggbb or #rrggbbaa hex.
 * Monaco `defineTheme` uses `Color.fromHex` on every entry — `rgba(...)` fails and becomes red.
 */
function toHex(cssColor: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#000000";
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return a === 255 ? `#${hex(r)}${hex(g)}${hex(b)}` : `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}`;
}

function readVarAsColor(
  cssVar: string,
  mode: "background" | "foreground",
  isDark: boolean
): string {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;background:transparent;color:transparent;";
  if (mode === "background") {
    el.style.backgroundColor = `var(${cssVar})`;
  } else {
    el.style.color = `var(${cssVar})`;
  }
  document.documentElement.appendChild(el);
  const cs = getComputedStyle(el);
  const raw = mode === "background" ? cs.backgroundColor : cs.color;
  el.remove();
  const v = (raw ?? "").trim();
  if (v && v !== "rgba(0, 0, 0, 0)" && v !== "transparent") return toHex(v);
  const fallback = mode === "background"
    ? (isDark ? "#171717" : "#ffffff")
    : (isDark ? "#fafafa" : "#171717");
  return fallback;
}

/** Read a design token used as a fill (chart colors, card, etc.). */
function readVarFill(cssVar: string, isDark: boolean): string {
  return readVarAsColor(cssVar, "background", isDark);
}

function readInlineBackground(cssText: string): string {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;${cssText}`;
  document.documentElement.appendChild(el);
  const v = getComputedStyle(el).backgroundColor.trim();
  el.remove();
  return v && v !== "rgba(0, 0, 0, 0)" && v !== "transparent" ? v : "rgba(128,128,128,0.12)";
}

/** Same as resolving a CSS background, but hex for `monaco.editor.defineTheme`. */
function readInlineThemeColor(cssText: string): string {
  return toHex(readInlineBackground(cssText));
}

function monokaiStyleRules(colors: {
  foreground: string;
  muted: string;
  keyword: string;
  string: string;
  number: string;
  function: string;
  type: string;
  constant: string;
  regexp: string;
  tag: string;
  invalid: string;
  accentFg: string;
}): { token: string; foreground?: string; fontStyle?: string }[] {
  const { foreground: fg, muted: mu, keyword: kw, string: st, number: nu, function: fn, type: ty, constant: ct, regexp: re, tag: tg, invalid: inv, accentFg: af } = colors;

  return [
    { token: "comment", foreground: mu },
    { token: "comment.doc", foreground: mu },
    { token: "comment.line", foreground: mu },
    { token: "comment.block", foreground: mu },

    { token: "keyword", foreground: kw },
    { token: "keyword.control", foreground: kw },
    { token: "keyword.operator", foreground: mu },
    { token: "operator", foreground: mu },
    { token: "delimiter", foreground: mu },
    { token: "delimiter.bracket", foreground: fg },
    { token: "delimiter.parenthesis", foreground: fg },
    { token: "delimiter.square", foreground: fg },
    { token: "delimiter.curly", foreground: fg },
    { token: "delimiter.angle", foreground: fg },

    { token: "string", foreground: st },
    { token: "string.escape", foreground: ct },
    { token: "string.yaml", foreground: st },
    { token: "string.key", foreground: st },
    { token: "string.value", foreground: st },

    { token: "number", foreground: nu },
    { token: "number.hex", foreground: nu },
    { token: "number.binary", foreground: nu },
    { token: "number.octal", foreground: nu },
    { token: "number.float", foreground: nu },

    { token: "regexp", foreground: re },

    { token: "namespace", foreground: ty },
    { token: "type", foreground: ty },
    { token: "type.identifier", foreground: ty },
    { token: "struct", foreground: ty },
    { token: "class", foreground: ty },
    { token: "class.identifier", foreground: ty },
    { token: "interface", foreground: ty },
    { token: "enum", foreground: ty },
    { token: "enumMember", foreground: ct },
    { token: "typeParameter", foreground: ty },

    { token: "function", foreground: fn },
    { token: "function.invoke", foreground: fn },
    { token: "method", foreground: fn },
    { token: "member", foreground: fn },
    { token: "macro", foreground: fn },

    { token: "variable", foreground: fg },
    { token: "variable.predefined", foreground: ct },
    { token: "variable.language", foreground: kw },
    { token: "parameter", foreground: af },
    { token: "identifier", foreground: fg },

    { token: "constant", foreground: ct },
    { token: "constant.language", foreground: kw },
    { token: "boolean", foreground: kw },

    { token: "tag", foreground: tg },
    { token: "metatag", foreground: tg },
    { token: "attribute.name", foreground: fn },
    { token: "attribute.value", foreground: st },

    { token: "annotation", foreground: ty },
    { token: "decorator", foreground: ty },

    { token: "invalid", foreground: inv },
    { token: "invalid.deprecated", foreground: inv, fontStyle: "strikethrough" },

    { token: "markup.heading", foreground: kw },
    { token: "markup.bold", foreground: fg, fontStyle: "bold" },
    { token: "markup.italic", foreground: fg, fontStyle: "italic" },
    { token: "markup.inserted", foreground: fn },
    { token: "markup.deleted", foreground: inv },
    { token: "markup.changed", foreground: ct },
    { token: "markup.link", foreground: fn },
    { token: "markup.quote", foreground: mu }
  ];
}

/** Registers and activates a Monaco theme aligned with shadcn tokens on `:root`. */
export function applyMonacoShadcnTheme(monaco: typeof MonacoApi): void {
  const isDark = document.documentElement.classList.contains("dark");

  const bg = readVarAsColor("--background", "background", isDark);
  const fg = readVarAsColor("--foreground", "foreground", isDark);
  const mutedFg = readVarAsColor("--muted-foreground", "foreground", isDark);
  const border = readVarAsColor("--border", "background", isDark);
  const primary = readVarAsColor("--primary", "foreground", isDark);
  const ring = readVarAsColor("--ring", "foreground", isDark);
  const destructive = readVarAsColor("--destructive", "foreground", isDark);
  const accentFg = readVarAsColor("--accent-foreground", "foreground", isDark);
  const card = readVarAsColor("--card", "background", isDark);

  const c1 = readVarFill("--chart-1", isDark);
  const c2 = readVarFill("--chart-2", isDark);
  const c3 = readVarFill("--chart-3", isDark);
  const c4 = readVarFill("--chart-4", isDark);
  const c5 = readVarFill("--chart-5", isDark);

  // Monokai-like roles using shadcn chart ramps (hue separation, works in light + dark).
  const syntax = {
    foreground: fg,
    muted: mutedFg,
    keyword: c4,
    string: c3,
    number: c1,
    function: c2,
    type: c5,
    constant: c1,
    regexp: c4,
    tag: c2,
    invalid: destructive,
    accentFg
  };

  // Selection / occurrence highlights use `--muted` so they stay neutral (primary is accent-colored).
  const selectionBg = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted) 62%, transparent);`
  );
  const selectionInactiveBg = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted) 40%, transparent);`
  );
  const lineHl = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted) 48%, transparent);`
  );
  const indent = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--border) 50%, transparent);`
  );
  const whitespace = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted-foreground) 18%, transparent);`
  );
  const wordHl = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted) 22%, transparent);`
  );
  const wordHlStrong = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted) 32%, transparent);`
  );
  const selHl = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--muted) 28%, transparent);`
  );
  const findMatch = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--chart-3) 35%, transparent);`
  );
  const findMatchHl = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--chart-3) 22%, transparent);`
  );
  const hoverHl = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--accent) 55%, transparent);`
  );
  const bracketMatchBg = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--ring) 16%, transparent);`
  );
  const diffInsert = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--chart-2) 22%, transparent);`
  );
  const diffRemove = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--destructive) 20%, transparent);`
  );
  const diffDiag = readInlineThemeColor(
    `background-color: color-mix(in srgb, var(--border) 35%, transparent);`
  );

  const theme = {
    base: (isDark ? "vs-dark" : "vs") as "vs-dark" | "vs",
    inherit: true as const,
    rules: monokaiStyleRules(syntax),
    colors: {
      "editor.background": bg,
      "editor.foreground": fg,
      "editorLineNumber.foreground": mutedFg,
      "editorLineNumber.activeForeground": fg,
      "editorGutter.background": bg,
      "editorGutter.modifiedBackground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-3) 45%, transparent);`
      ),
      "editorGutter.addedBackground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-2) 45%, transparent);`
      ),
      "editorGutter.deletedBackground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--destructive) 40%, transparent);`
      ),
      "editorCursor.foreground": primary,
      "editor.selectionBackground": selectionBg,
      "editor.inactiveSelectionBackground": selectionInactiveBg,
      "editor.selectionHighlightBackground": selHl,
      "editor.lineHighlightBackground": lineHl,
      "editor.lineHighlightBorder": "#00000000",
      "editorIndentGuide.background": indent,
      "editorIndentGuide.activeBackground": border,
      "editorWhitespace.foreground": whitespace,
      "editor.wordHighlightBackground": wordHl,
      "editor.wordHighlightStrongBackground": wordHlStrong,
      "editor.findMatchBackground": findMatch,
      "editor.findMatchHighlightBackground": findMatchHl,
      "editor.hoverHighlightBackground": hoverHl,
      "editorLink.activeForeground": primary,
      "editorBracketMatch.border": ring,
      "editorBracketMatch.background": bracketMatchBg,
      "editorBracketHighlight.foreground1": c1,
      "editorBracketHighlight.foreground2": c2,
      "editorBracketHighlight.foreground3": c3,
      "editorBracketHighlight.foreground4": c4,
      "editorBracketHighlight.foreground5": c5,
      "editorBracketHighlight.foreground6": primary,
      "editorBracketPairGuide.activeBackground1": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-1) 28%, transparent);`
      ),
      "editorBracketPairGuide.activeBackground2": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-2) 28%, transparent);`
      ),
      "editorBracketPairGuide.activeBackground3": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-3) 28%, transparent);`
      ),
      "editorBracketPairGuide.activeBackground4": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-4) 28%, transparent);`
      ),
      "editorBracketPairGuide.activeBackground5": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-5) 28%, transparent);`
      ),
      "editorBracketPairGuide.background1": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-1) 14%, transparent);`
      ),
      "editorBracketPairGuide.background2": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-2) 14%, transparent);`
      ),
      "editorBracketPairGuide.background3": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-3) 14%, transparent);`
      ),
      "editorBracketPairGuide.background4": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-4) 14%, transparent);`
      ),
      "editorBracketPairGuide.background5": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--chart-5) 14%, transparent);`
      ),
      "editorError.foreground": destructive,
      "editorWarning.foreground": c3,
      "editorInfo.foreground": c2,
      "editorRuler.foreground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--border) 70%, transparent);`
      ),
      "scrollbar.shadow": "#00000000",
      /** Find/replace, rename, and other floating editor widgets — match app `bg-background`. */
      "editorWidget.background": bg,
      "editorWidget.foreground": fg,
      "editorWidget.border": border,
      /** Find/replace inputs (inherits vs-dark gray if unset). */
      "input.background": bg,
      "input.foreground": fg,
      "input.border": border,
      "input.placeholderForeground": mutedFg,
      "editorSuggestWidget.background": card,
      "editorSuggestWidget.border": border,
      "editorSuggestWidget.foreground": fg,
      "editorSuggestWidget.highlightForeground": primary,
      "editorSuggestWidget.selectedBackground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--accent) 70%, transparent);`
      ),
      "peekViewTitle.background": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--muted) 65%, transparent);`
      ),
      "peekViewTitleLabel.foreground": fg,
      "peekView.border": border,
      "peekViewEditor.background": bg,
      "peekViewResult.background": card,
      "peekViewResult.selectionBackground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--muted) 36%, transparent);`
      ),
      "diffEditor.insertedTextBackground": diffInsert,
      "diffEditor.removedTextBackground": diffRemove,
      "diffEditor.diagonalFill": diffDiag,
      "diffEditor.unchangedRegionBackground": readInlineThemeColor(
        `background-color: color-mix(in srgb, var(--muted) 35%, transparent);`
      )
    }
  };

  // Vitest mocks only stub `create` / `createDiffEditor`; real API has `defineTheme`.
  if (typeof monaco.editor.defineTheme === "function") {
    monaco.editor.defineTheme(MONACO_INSTRUMENT_THEME, theme);
    monaco.editor.setTheme(MONACO_INSTRUMENT_THEME);
  } else {
    monaco.editor.setTheme(isDark ? "vs-dark" : "vs");
  }
}
