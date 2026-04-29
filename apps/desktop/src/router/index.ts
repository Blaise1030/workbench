import { createMemoryHistory, createRouter } from "vue-router";
import WorkspaceLayout from "@/layouts/WorkspaceLayout.vue";
import Layout from "@/layouts/Layout.vue";
import WelcomePage from "@/modules/welcome/WelcomePage.vue";
import CreateNewThread from "@/modules/agent/CreateNewThread.vue";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { decodeBranch, encodeBranch } from "./branchParam";

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: "/",
      name: "welcome",
      component: WelcomePage,
    },
    {
      path: "/:projectId/:branch",
      name: "git",
      component: Layout,
      children: [
        {
          path: "thread/new",
          name: "threadNew",
          component: CreateNewThread,
        },
        {
          path: "thread/:threadId",
          name: "thread",
          component: WorkspaceLayout,
          children: [
            {
              path: "",
              redirect: { name: "threadNew" }
            },
            {
              path: "git",
              name: "gitPanel",
              component: WorkspaceLayout
            },
            {
              path: "preview",
              name: "previewPanel",
              component: WorkspaceLayout
            },
            {
              path: "files",
              name: "filePanel",          
              children: [
                {
                  path: "",
                  name: "filesDefault",
                  component: WorkspaceLayout
                },
                {
                  path: ":filename+",              
                  component: WorkspaceLayout
                }
              ]
            },
          ]
        },        
      ],
    },    
  ]
});

router.beforeEach((to) => {
  const projectId = to.params.projectId as string | undefined;
  const branch = to.params.branch as string | undefined;
  const threadId = to.params.threadId as string | undefined;

  if (!projectId) return true;

  const workspace = useWorkspaceStore();

  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) return { name: "welcome" };

  if (branch) {
    const decodedBranch = decodeBranch(branch);
    const worktree = workspace.worktrees.find(
      (w) => w.projectId === projectId && w.branch === decodedBranch
    );
    if (!worktree) {
      const primary = workspace.worktrees.find((w) => w.projectId === projectId && w.isDefault);
      if (!primary) return { name: "welcome" };
      const eb = encodeBranch(primary.branch);
      const fallbackThread = workspace.threads.find((t) => t.worktreeId === primary.id);
      if (fallbackThread) {
        return {
          name: "thread",
          params: { projectId, branch: eb, threadId: fallbackThread.id }
        };
      }
      return { name: "files", params: { projectId, branch: eb } };
    }

    if (threadId) {
      const thread = workspace.threads.find((t) => t.id === threadId);
      if (!thread) {
        const fallback = workspace.threads.find((t) => t.worktreeId === worktree.id);
        if (fallback) {
          return { name: "thread", params: { projectId, branch, threadId: fallback.id } };
        }
        return { name: "files", params: { projectId, branch } };
      }
    }
  }

  return true;
});
