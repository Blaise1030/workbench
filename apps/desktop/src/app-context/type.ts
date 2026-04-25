import type { GitService } from "@/services/git/gitService";
import type { ThreadManagementService } from "@/services/thread-management/threadManagementService";

export type AppMode = "desktop" | "mobile" | "cloud";

export type AppContext = {
  mode: AppMode;
  threadManagementService: ThreadManagementService;
  gitService: GitService;  
};