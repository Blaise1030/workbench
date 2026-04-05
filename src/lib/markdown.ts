import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Renders GitHub-flavored Markdown to sanitized HTML for in-app preview.
 */
export function renderMarkdownToHtml(markdown: string): string {
  try {
    const raw = marked.parse(markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  } catch {
    return DOMPurify.sanitize("<p>Could not render this Markdown.</p>");
  }
}
