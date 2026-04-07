const { spawn } = require("node:child_process");
const { getDevPort } = require("./devPort.cjs");

const viteCommand = process.platform === "win32" ? "vite.cmd" : "vite";
const port = getDevPort();

const child = spawn(viteCommand, ["--strictPort", "--port", port], {
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
