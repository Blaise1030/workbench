const { spawn } = require("node:child_process");
const { getDevPort, getDevServerUrl } = require("./devPort.cjs");

const port = getDevPort();
const devServerUrl = getDevServerUrl();
const waitOnCommand = process.platform === "win32" ? "wait-on.cmd" : "wait-on";
const electronCommand = process.platform === "win32" ? "electron.cmd" : "electron";

const waitOnArgs = [
  `tcp:${port}`,
  "file:dist-electron/electron/main.js",
  "file:dist-electron/electron/mainApp.js",
  "file:dist-electron/electron/preload.js",
  "file:dist-electron/src/shared/ipc.js"
];

const waitOn = spawn(waitOnCommand, waitOnArgs, {
  stdio: "inherit"
});

waitOn.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
    return;
  }

  const electron = spawn(electronCommand, ["dist-electron/electron/main.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });

  electron.on("exit", (electronCode) => {
    process.exit(electronCode ?? 0);
  });

  electron.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
});

waitOn.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
