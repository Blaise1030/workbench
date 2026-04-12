# Design Spec: Landing Page OG Image & SEO Metadata

## Summary
Add Open Graph (OG) and Twitter Card metadata to the `workbench` landing page to ensure professional sharing previews across social platforms (Twitter, Slack, Discord, LinkedIn).

## Success Criteria
- [ ] Share previews show the `workbench-preview.png` image.
- [ ] Share previews show correct title and description.
- [ ] Reusable `SEO.astro` component exists for future expansion.

## Architecture & Components

### 1. `apps/landing-page/src/components/SEO.astro`
A new Astro component to centralize metadata. It will accept the following props:
- `title` (string, default: `workbench — Terminal for the multi-agent era`)
- `description` (string, default: `workbench — a terminal built for the multi-agent era. Run Claude Code, Gemini CLI, Cursor Agent, and more side by side, each isolated on its own worktree.`)
- `image` (string, default: `/workbench-preview.png`)
- `canonicalURL` (string, default: generated from `Astro.url.href`)

**Tags to include:**
- `<title>`
- `<meta name="description" ...>`
- `og:type` (website)
- `og:url`
- `og:title`
- `og:description`
- `og:image`
- `twitter:card` (`summary_large_image`)
- `twitter:url`
- `twitter:title`
- `twitter:description`
- `twitter:image`

### 2. `apps/landing-page/src/pages/index.astro`
Integration point:
- Import `SEO` component.
- Replace existing hardcoded `<title>` and `<meta name="description">` tags with `<SEO />`.

## Trade-offs
- **Inlining vs Component:** Inlining is faster but less maintainable. A component allows global updates to social handles or branding later.
- **Image Choice:** `workbench-preview.png` shows the actual UI, which is more engaging for developers than a static logo.

## Testing Strategy
- Manual verification of rendered HTML `<head>`.
- Verification using online OG debuggers (if accessible) or by inspecting meta tags.
