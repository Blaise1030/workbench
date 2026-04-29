import { createMemoryHistory, createRouter, type RouteLocationRaw } from "vue-router";
import { defineComponent } from "vue";

const Stub = defineComponent({ template: "<div />" });

/** Await before mounting so the first `useRoute()` in components matches `initialRoute` (unlike `void router.push` which races the first render). */
export async function createTestRouter(initialRoute: RouteLocationRaw = "/") {
  const r = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "welcome", component: Stub },
      { path: "/:projectId/:branch/thread/new", name: "threadNew", component: Stub },
      {
        path: "/:projectId/:branch/thread/:threadId",
        component: Stub,
        children: [
          { path: "agent", name: "agent", component: Stub },
          { path: "git", name: "gitPanel", component: Stub },
          { path: "preview", name: "previewPanel", component: Stub },
          { path: "files", name: "filesPanel", component: Stub },
          { path: "files/:filename+", name: "fileDetail", component: Stub },
        ],
      },
    ]
  });

  await r.push(initialRoute);
  return r;
}
