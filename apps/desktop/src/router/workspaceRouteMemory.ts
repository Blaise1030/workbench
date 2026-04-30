import type { RouteLocationNormalized, RouteParams } from "vue-router";

const STORAGE_KEY = "instrument.workspaceLastRoute.v1";

/** Namespaced routes under `/:projectId/:branch/...` we persist for tab switching. */
const PERSISTED_ROUTE_NAMES = new Set([
  "threadNew",
  "agent",
  "gitPanel",
  "previewPanel",
  "filesPanel",
  "fileDetail",
]);

export type StoredWorkspaceRoute = {
  name: string;
  params: Record<string, string | string[]>;
};

function sanitizeParamsForStorage(params: RouteParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      const strings = v.filter((x): x is string => typeof x === "string");
      if (strings.length > 0) out[k] = strings;
    }
  }
  return out;
}

/** Persist last in-app location for a project (session). Called from `router.afterEach`. */
export function persistWorkspaceRouteFromNavigation(to: RouteLocationNormalized): void {
  const projectId = to.params.projectId;
  if (typeof projectId !== "string" || !to.name) return;
  const name = String(to.name);
  if (!PERSISTED_ROUTE_NAMES.has(name)) return;

  const stored: StoredWorkspaceRoute = {
    name,
    params: sanitizeParamsForStorage(to.params),
  };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, StoredWorkspaceRoute>) : {};
    map[projectId] = stored;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function loadStoredWorkspaceRoute(projectId: string): StoredWorkspaceRoute | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const entry = map[projectId];
    if (!entry || typeof entry !== "object" || entry === null) return null;
    const name = (entry as { name?: unknown }).name;
    const params = (entry as { params?: unknown }).params;
    if (typeof name !== "string" || !PERSISTED_ROUTE_NAMES.has(name)) return null;
    if (!params || typeof params !== "object" || params === null) return null;
    return { name, params: params as Record<string, string | string[]> };
  } catch {
    return null;
  }
}

export function routeParamFirst(p: string | string[] | undefined): string | undefined {
  if (typeof p === "string") return p;
  if (Array.isArray(p) && p.length > 0 && typeof p[0] === "string") return p[0];
  return undefined;
}

/** Params suitable for `router.push` from stored JSON. */
export function storedRouteToLocation(stored: StoredWorkspaceRoute): {
  name: string;
  params: Record<string, string | string[]>;
} {
  return { name: stored.name, params: { ...stored.params } };
}

export function storedRouteTargetsProject(stored: StoredWorkspaceRoute, projectId: string): boolean {
  return routeParamFirst(stored.params.projectId) === projectId;
}
