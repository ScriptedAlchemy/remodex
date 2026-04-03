const { createICloudHelperClient } = require("./icloud-helper-client");

function createAsyncHelperClient({
  config,
  helperPath,
  containerId,
  deviceStateDir,
  logPrefix,
  onAsyncRequest,
  onStatusChange,
}) {
  return createICloudHelperClient({
    enabled: Boolean(config.cloudAsyncEnabled),
    helperPath,
    containerId,
    deviceStateDir,
    logPrefix,
    onAsyncRequest,
    onStatusChange,
  });
}

module.exports = {
  createAsyncHelperClient,
};
