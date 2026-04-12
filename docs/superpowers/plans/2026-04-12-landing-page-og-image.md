# Landing Page OG Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Open Graph and Twitter Card metadata to the landing page using a reusable `SEO.astro` component.

**Architecture:** Create a new `SEO.astro` component in `apps/landing-page/src/components/` and integrate it into `apps/landing-page/src/pages/index.astro`.

**Tech Stack:** Astro, HTML Meta Tags.

---

### Task 1: Create the SEO Component

**Files:**
- Create: `apps/landing-page/src/components/SEO.astro`

- [ ] **Step 1: Write the SEO component code**

```astro
---
interface Props {
	title?: string;
	description?: string;
	image?: string;
	canonicalURL?: string;
}

const {
	title = "workbench — Terminal for the multi-agent era",
	description = "workbench — a terminal built for the multi-agent era. Run Claude Code, Gemini CLI, Cursor Agent, and more side by side, each isolated on its own worktree. Bring your own subscription.",
	image = "/workbench-preview.png",
	canonicalURL = Astro.url.href,
} = Astro.props;
---

<!-- Global Metadata -->
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" type="image/png" href="/workbench-logo.png" />
<link rel="apple-touch-icon" href="/workbench-logo.png" />
<meta name="generator" content={Astro.generator} />

<!-- Canonical URL -->
<link rel="canonical" href={canonicalURL} />

<!-- Primary Meta Tags -->
<title>{title}</title>
<meta name="title" content={title} />
<meta name="description" content={description} />

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content={Astro.url} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={new URL(image, Astro.url)} />

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:url" content={Astro.url} />
<meta property="twitter:title" content={title} />
<meta property="twitter:description" content={description} />
<meta property="twitter:image" content={new URL(image, Astro.url)} />
```

- [ ] **Step 2: Commit**

```bash
git add apps/landing-page/src/components/SEO.astro
git commit -m "feat: add SEO component for landing page"
```

---

### Task 2: Integrate SEO Component into index.astro

**Files:**
- Modify: `apps/landing-page/src/pages/index.astro`

- [ ] **Step 1: Import the SEO component**

Add the import at the top of the script section:
```typescript
import SEO from "../components/SEO.astro";
```

- [ ] **Step 2: Replace existing meta tags with SEO component**

Remove:
```html
		<meta charset="utf-8" />
		<link rel="icon" type="image/png" href="/workbench-logo.png" />
		<link rel="apple-touch-icon" href="/workbench-logo.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="generator" content={Astro.generator} />
		<meta
			name="description"
			content="workbench — a terminal built for the multi-agent era. Run Claude Code, Gemini CLI, Cursor Agent, and more side by side, each isolated on its own worktree. Bring your own subscription."
		/>
		<title>workbench — Terminal for the multi-agent era</title>
```

Add:
```html
		<SEO />
```

- [ ] **Step 3: Verify the changes**

Run: `grep -E "og:image|twitter:image" apps/landing-page/src/pages/index.astro`
(This won't work perfectly since it's an import, but we can check if the rendered component works in dev or just trust the integration if it looks correct).

Actually, let's verify by checking the file content:
Run: `cat apps/landing-page/src/pages/index.astro | head -n 60`

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/pages/index.astro
git commit -m "feat: integrate SEO component into landing page"
```
