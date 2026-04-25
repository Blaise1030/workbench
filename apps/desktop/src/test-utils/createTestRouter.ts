import { createMemoryHistory, createRouter, type RouteLocationRaw } from "vue-router";
import WorkspaceLayout from "@/layouts/WorkspaceLayout.vue";

/** Await before mounting so the first `useRoute()` in components matches `initialRoute` (unlike `void router.push` which races the first render). */
export async function createTestRouter(initialRoute: RouteLocationRaw = "/") {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "welcome", component: WorkspaceLayout },
      { path: "/:projectId/:branch/thread/:threadId", name: "thread", component: WorkspaceLayout },
      { path: "/:projectId/:branch/git", name: "git", component: WorkspaceLayout },
      { path: "/:projectId/:branch/files/:filename+", name: "file", component: WorkspaceLayout },
      { path: "/:projectId/:branch/files", name: "files", component: WorkspaceLayout },
      { path: "/:projectId/:branch/preview", name: "preview", component: WorkspaceLayout }
    ]
  });

  await r.push(initialRoute);
  return r;
}
