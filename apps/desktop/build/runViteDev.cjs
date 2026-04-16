const { spawn } = require("node:child_process");
const { getDevPort } = require("./devPort.cjs");

const viteCommand = process.platform === "win32" ? "vite.cmd" : "vite";
const port = getDevPort();

// When running from inside a git worktree, pass the worktree root as an env var so
// vite.config.ts can scope its watch.ignored to only sibling worktrees (not our own files).
const cwd = process.cwd();
const wtParts = cwd.split("/.worktrees/");
const worktreeRoot =
  wtParts.length > 1 ? `${wtParts[0]}/.worktrees/${wtParts[1].split("/")[0]}` : undefined;

const child = spawn(viteCommand, ["--strictPort", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, ...(worktreeRoot ? { WORKTREE_ROOT: worktreeRoot } : {}) }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
