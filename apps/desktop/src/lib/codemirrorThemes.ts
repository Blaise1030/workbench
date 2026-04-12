import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * Atom One Dark theme for CodeMirror 6.
 */
export const atomOneDarkTheme = EditorView.theme({
  "&": {
    color: "#abb2bf",
    backgroundColor: "var(--background)"
  },
  ".cm-content": {
    caretColor: "var(--foreground)"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--foreground)"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(255, 255, 255, 0.1)"
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none"
  },
  ".cm-linenumber": {
    color: "#4b5263"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.04)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    color: "#abb2bf"
  }
}, { dark: true });

export const atomOneDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c678dd" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#e06c75" },
  { tag: [t.function(t.variableName), t.labelName], color: "#61afef" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#d19a66" },
  { tag: [t.definition(t.name), t.separator], color: "#abb2bf" },
  { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#e5c07b" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#56b6c2" },
  { tag: [t.meta, t.comment], color: "#5c6370", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#98c379", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#e06c75" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#d19a66" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#98c379" },
  { tag: t.number, color: "#d19a66" },
  { tag: t.propertyName, color: "#e06c75" },
  { tag: t.invalid, color: "#ffffff" },
]);

/**
 * Atom One Light theme for CodeMirror 6.
 */
export const atomOneLightTheme = EditorView.theme({
  "&": {
    color: "#383a42",
    backgroundColor: "var(--background)"
  },
  ".cm-content": {
    caretColor: "var(--foreground)"
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--foreground)"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(0, 0, 0, 0.1)"
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none"
  },
  ".cm-linenumber": {
    color: "#9d9d9f"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(0, 0, 0, 0.04)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    color: "#383a42"
  }
}, { dark: false });

export const atomOneLightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#a626a4" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#e45649" },
  { tag: [t.function(t.variableName), t.labelName], color: "#4078f2" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#986801" },
  { tag: [t.definition(t.name), t.separator], color: "#383a42" },
  { tag: [t.typeName, t.className, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#c18401" },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#0184bc" },
  { tag: [t.meta, t.comment], color: "#a0a1a7", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#50a14f", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#e45649" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#986801" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "#50a14f" },
  { tag: t.number, color: "#986801" },
  { tag: t.propertyName, color: "#e45649" },
  { tag: t.invalid, color: "#000000" },
]);

export const atomOneDark: Extension = [atomOneDarkTheme, syntaxHighlighting(atomOneDarkHighlightStyle)];
export const atomOneLight: Extension = [atomOneLightTheme, syntaxHighlighting(atomOneLightHighlightStyle)];

// Aliases for backwards compatibility
export const yonce = atomOneDark;
export const yeti = atomOneLight;
