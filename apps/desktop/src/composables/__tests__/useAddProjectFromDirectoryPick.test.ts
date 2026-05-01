import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@shared/domain";
import type { WorkspaceSnapshot } from "@shared/ipc";
import { useAddProjectFromDirectoryPick } from "../useAddProjectFromDirectoryPick";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn()
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    error: toastErrorMock,
    success: vi.fn(),
    dismiss: vi.fn()
  })
}));

function emptySnapshot(): WorkspaceSnapshot {
  return {
    projects: [],
    worktrees: [],
    threads: [],
    threadSessions: [],
    activeProjectId: null,
    activeWorktreeId: null,
    activeThreadId: null
  };
}

function minimalProject(overrides: Partial<Project> & Pick<Project, "id" | "name" | "repoPath">): Project {
  return {
    status: "idle",
    tabOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("useAddProjectFromDirectoryPick", () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("success: adds project and navigates to new id", async () => {
    const navigateToProject = vi.fn().mockResolvedValue(undefined);
    const getSnapshot = vi.fn().mockResolvedValueOnce(emptySnapshot());
    const pickRepoDirectory = vi.fn().mockResolvedValue("/new/repo");
    const addProject = vi.fn().mockResolvedValue(
      {
        ...emptySnapshot(),
        projects: [
          minimalProject({
            id: "p-new",
            name: "repo",
            repoPath: "/new/repo"
          })
        ]
      } satisfies WorkspaceSnapshot
    );

    vi.stubGlobal("window", {
      ...window,
      workspaceApi: {
        getSnapshot,
        pickRepoDirectory,
        addProject
      }
    });

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(addProject).toHaveBeenCalledWith({ name: "repo", repoPath: "/new/repo" });
    expect(navigateToProject).toHaveBeenCalledWith("p-new");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("cancel: null pick skips add and navigate", async () => {
    const navigateToProject = vi.fn();
    const addProject = vi.fn();
    vi.stubGlobal("window", {
      ...window,
      workspaceApi: {
        getSnapshot: vi.fn().mockResolvedValue(emptySnapshot()),
        pickRepoDirectory: vi.fn().mockResolvedValue(null),
        addProject
      }
    });

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(addProject).not.toHaveBeenCalled();
    expect(navigateToProject).not.toHaveBeenCalled();
  });

  it("duplicate: normalized path match shows error and skips add", async () => {
    const navigateToProject = vi.fn();
    const addProject = vi.fn();
    vi.stubGlobal("window", {
      ...window,
      workspaceApi: {
        getSnapshot: vi.fn().mockResolvedValue({
          ...emptySnapshot(),
          projects: [
            minimalProject({
              id: "p1",
              name: "repo",
              repoPath: "/new/repo///"
            })
          ]
        } satisfies WorkspaceSnapshot),
        pickRepoDirectory: vi.fn().mockResolvedValue("/new/repo"),
        addProject
      }
    });

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(addProject).not.toHaveBeenCalled();
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Already in workspace",
      "This folder is already in the workspace."
    );
  });

  it("addProject throws: error toast and no navigate", async () => {
    const navigateToProject = vi.fn();
    const err = new Error("disk full");
    vi.stubGlobal("window", {
      ...window,
      workspaceApi: {
        getSnapshot: vi.fn().mockResolvedValue(emptySnapshot()),
        pickRepoDirectory: vi.fn().mockResolvedValue("/new/repo"),
        addProject: vi.fn().mockRejectedValue(err)
      }
    });

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(navigateToProject).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Could not add project", "Error: disk full");
  });
});
