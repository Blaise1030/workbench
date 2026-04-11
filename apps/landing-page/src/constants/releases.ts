/** Canonical GitHub repo; must match `origin` for release artifacts. */
export const GITHUB_REPO = "Blaise1030/workbench" as const;

export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}` as const;

/** Stable manifest produced by `.github/workflows/release.yml` (latest.json asset). */
export const LATEST_RELEASE_JSON_URL = `${GITHUB_REPO_URL}/releases/latest/download/latest.json` as const;

/** Fallback when the manifest fetch fails (CORS or missing asset). Public API allows browser GET. */
export const GITHUB_API_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest` as const;

export const LATEST_RELEASE_PAGE_URL = `${GITHUB_REPO_URL}/releases/latest` as const;

/** In-repo changelog for the desktop app (GitHub renders Markdown). */
export const CHANGELOG_URL = `${GITHUB_REPO_URL}/blob/main/apps/desktop/CHANGELOG.md` as const;
