export interface GitHubRemote {
  owner: string;
  repo: string;
}

export function parseGitHubRemoteUrl(url: string): GitHubRemote | null {
  const https = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?(?:\s|$)/);
  if (https) return { owner: https[1]!, repo: https[2]! };
  const ssh = url.match(/git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?(?:\s|$)/);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  return null;
}

export async function detectGitHubRemote(cwd: string): Promise<GitHubRemote | null> {
  const api = (window as any).workspaceApi ?? null;
  if (!api?.getGitRemotes) return null;
  try {
    const remotes: Record<string, string> = await api.getGitRemotes(cwd);
    for (const url of Object.values(remotes)) {
      const parsed = parseGitHubRemoteUrl(url);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
