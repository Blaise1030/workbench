const DEFAULT_DEV_PORT = "5181";

function getDevPort(env = process.env) {
  const port = env.PORT?.trim();

  if (!port) {
    return DEFAULT_DEV_PORT;
  }

  return /^\d+$/.test(port) ? port : DEFAULT_DEV_PORT;
}

function getDevServerUrl(env = process.env) {
  return `http://localhost:${getDevPort(env)}`;
}

module.exports = {
  DEFAULT_DEV_PORT,
  getDevPort,
  getDevServerUrl
};
