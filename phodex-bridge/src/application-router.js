const { handleDesktopRequest } = require("./desktop-handler");
const { handleGitRequest } = require("./git-handler");
const { handleThreadContextRequest } = require("./thread-context-handler");
const { handleWorkspaceRequest } = require("./workspace-handler");

function createApplicationRouter({
  config,
  codex,
  voiceHandler,
  notificationsHandler,
  desktopRefresher,
  rolloutLiveMirror,
  handleBridgeManagedHandshakeMessage,
  handleBridgeManagedAccountRequest,
  rememberForwardedRequestMethod,
  rememberThreadFromMessage,
  prepareCodexRequest,
  getHandshakeState,
  forwardedInitializeRequestIds,
  defaultResponseSender,
}) {
  return function handleApplicationMessage(rawMessage, responseSender = defaultResponseSender) {
    if (
      handleBridgeManagedHandshakeMessage(rawMessage, {
        codexHandshakeState: getHandshakeState(),
        forwardedInitializeRequestIds,
        sendResponse: responseSender,
      })
    ) {
      return;
    }
    if (handleBridgeManagedAccountRequest(rawMessage, responseSender)) {
      return;
    }
    if (voiceHandler.handleVoiceRequest(rawMessage, responseSender)) {
      return;
    }
    if (handleThreadContextRequest(rawMessage, responseSender)) {
      return;
    }
    if (handleWorkspaceRequest(rawMessage, responseSender)) {
      return;
    }
    if (notificationsHandler.handleNotificationsRequest(rawMessage, responseSender)) {
      return;
    }
    if (
      handleDesktopRequest(rawMessage, responseSender, {
        bundleId: config.codexBundleId,
        appPath: config.codexAppPath,
      })
    ) {
      return;
    }
    if (handleGitRequest(rawMessage, responseSender)) {
      return;
    }

    // Default fallthrough to Codex and observers
    desktopRefresher.handleInbound(rawMessage);
    rolloutLiveMirror?.observeInbound(rawMessage);
    const preparedMessage = prepareCodexRequest(rawMessage, responseSender, defaultResponseSender);
    rememberForwardedRequestMethod(preparedMessage);
    rememberThreadFromMessage("phone", rawMessage);
    codex.send(preparedMessage);
  };
}

module.exports = {
  createApplicationRouter,
};
