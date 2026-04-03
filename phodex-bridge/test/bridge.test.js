// FILE: bridge.test.js
// Purpose: Verifies relay watchdog helpers used to recover from stale sleep/wake sockets.
// Layer: Unit test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, ../src/bridge

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildHeartbeatBridgeStatus,
  createAsyncResponseRouter,
  hasRelayConnectionGoneStale,
  sanitizeThreadHistoryImagesForRelay,
} = require("../src/bridge");
const {
  handleBridgeManagedHandshakeMessage,
} = require("../src/bridge-managed-handlers");

test("hasRelayConnectionGoneStale returns true once the relay silence crosses the timeout", () => {
  assert.equal(
    hasRelayConnectionGoneStale(1_000, {
      now: 71_000,
      staleAfterMs: 70_000,
    }),
    true
  );
});

test("hasRelayConnectionGoneStale returns false for fresh or missing activity timestamps", () => {
  assert.equal(
    hasRelayConnectionGoneStale(1_000, {
      now: 70_999,
      staleAfterMs: 70_000,
    }),
    false
  );
  assert.equal(hasRelayConnectionGoneStale(Number.NaN), false);
});

test("buildHeartbeatBridgeStatus downgrades stale connected snapshots", () => {
  assert.deepEqual(
    buildHeartbeatBridgeStatus(
      {
        state: "running",
        connectionStatus: "connected",
        pid: 123,
        lastError: "",
      },
      1_000,
      {
        now: 26_500,
        staleAfterMs: 25_000,
        staleMessage: "Relay heartbeat stalled; reconnect pending.",
      }
    ),
    {
      state: "running",
      connectionStatus: "disconnected",
      pid: 123,
      lastError: "Relay heartbeat stalled; reconnect pending.",
    }
  );
});

test("buildHeartbeatBridgeStatus leaves fresh or already-disconnected snapshots unchanged", () => {
  const freshStatus = {
    state: "running",
    connectionStatus: "connected",
    pid: 123,
    lastError: "",
  };
  assert.deepEqual(
    buildHeartbeatBridgeStatus(freshStatus, 1_000, {
      now: 20_000,
      staleAfterMs: 25_000,
    }),
    freshStatus
  );

  const disconnectedStatus = {
    state: "running",
    connectionStatus: "disconnected",
    pid: 123,
    lastError: "",
  };
  assert.deepEqual(buildHeartbeatBridgeStatus(disconnectedStatus, 1_000), disconnectedStatus);
});

test("sanitizeThreadHistoryImagesForRelay replaces inline history images with lightweight references", () => {
  const rawMessage = JSON.stringify({
    id: "req-thread-read",
    result: {
      thread: {
        id: "thread-images",
        turns: [
          {
            id: "turn-1",
            items: [
              {
                id: "item-user",
                type: "user_message",
                content: [
                  {
                    type: "input_text",
                    text: "Look at this screenshot",
                  },
                  {
                    type: "image",
                    image_url: "data:image/png;base64,AAAA",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });

  const sanitized = JSON.parse(
    sanitizeThreadHistoryImagesForRelay(rawMessage, "thread/read")
  );
  const content = sanitized.result.thread.turns[0].items[0].content;

  assert.deepEqual(content[0], {
    type: "input_text",
    text: "Look at this screenshot",
  });
  assert.deepEqual(content[1], {
    type: "image",
    url: "remodex://history-image-elided",
  });
});

test("sanitizeThreadHistoryImagesForRelay leaves unrelated RPC payloads unchanged", () => {
  const rawMessage = JSON.stringify({
    id: "req-other",
    result: {
      ok: true,
    },
  });

  assert.equal(
    sanitizeThreadHistoryImagesForRelay(rawMessage, "turn/start"),
    rawMessage
  );
});

test("handleBridgeManagedHandshakeMessage sends warm initialize responses to the provided sender", () => {
  const responses = [];
  const forwardedInitializeRequestIds = new Set();

  const handled = handleBridgeManagedHandshakeMessage(JSON.stringify({
    id: "req-1",
    method: "initialize",
    params: {},
  }), {
    codexHandshakeState: "warm",
    forwardedInitializeRequestIds,
    sendResponse(message) {
      responses.push(JSON.parse(message));
    },
  });

  assert.equal(handled, true);
  assert.equal(forwardedInitializeRequestIds.size, 0);
  assert.deepEqual(responses, [{
    id: "req-1",
    result: {
      bridgeManaged: true,
    },
  }]);
});

test("handleBridgeManagedHandshakeMessage forwards cold initialize requests to Codex", () => {
  const forwardedInitializeRequestIds = new Set();

  const handled = handleBridgeManagedHandshakeMessage(JSON.stringify({
    id: "req-2",
    method: "initialize",
    params: {},
  }), {
    codexHandshakeState: "cold",
    forwardedInitializeRequestIds,
    sendResponse() {
      throw new Error("cold initialize should not be answered by the bridge");
    },
  });

  assert.equal(handled, false);
  assert.deepEqual([...forwardedInitializeRequestIds], ["req-2"]);
});

test("createAsyncResponseRouter rewrites async helper request ids before Codex dispatch", () => {
  const responseSender = () => {};
  const defaultResponseSender = () => {};
  const router = createAsyncResponseRouter({
    createRequestId: () => "async-helper:scoped-1",
  });

  const prepared = JSON.parse(router.prepareRequest(JSON.stringify({
    id: "shared-id",
    method: "thread/read",
    params: { threadId: "thread-1" },
  }), responseSender, defaultResponseSender));

  assert.equal(prepared.id, "async-helper:scoped-1");
  assert.equal(prepared.method, "thread/read");
  assert.deepEqual(prepared.params, { threadId: "thread-1" });
});

test("createAsyncResponseRouter routes colliding raw ids back to the correct transport", () => {
  const relayResponses = [];
  const helperResponses = [];
  const defaultResponseSender = (message) => {
    relayResponses.push(JSON.parse(message));
  };
  const helperResponseSender = (message) => {
    helperResponses.push(JSON.parse(message));
  };
  const router = createAsyncResponseRouter({
    createRequestId: (() => {
      let index = 0;
      return () => `async-helper:scoped-${++index}`;
    })(),
  });

  const relayRequest = router.prepareRequest(JSON.stringify({
    id: "42",
    method: "thread/read",
  }), defaultResponseSender, defaultResponseSender);
  const helperRequest = router.prepareRequest(JSON.stringify({
    id: "42",
    method: "thread/read",
  }), helperResponseSender, defaultResponseSender);

  assert.equal(JSON.parse(relayRequest).id, "42");
  assert.equal(JSON.parse(helperRequest).id, "async-helper:scoped-1");

  assert.equal(
    router.routeResponse(JSON.stringify({
      id: "42",
      result: { source: "relay" },
    })),
    false
  );
  assert.deepEqual(helperResponses, []);
  assert.deepEqual(relayResponses, []);

  assert.equal(
    router.routeResponse(JSON.stringify({
      id: "async-helper:scoped-1",
      result: { source: "helper" },
    })),
    true
  );
  assert.deepEqual(helperResponses, [{
    id: "42",
    result: { source: "helper" },
  }]);
  assert.deepEqual(relayResponses, []);
});

test("createAsyncResponseRouter ignores notifications and non-function senders", () => {
  const defaultResponseSender = () => {};
  const router = createAsyncResponseRouter({
    createRequestId: () => "async-helper:unused",
  });

  const notification = router.prepareRequest(JSON.stringify({
    method: "thread/changed",
    params: { threadId: "thread-1" },
  }), () => {}, defaultResponseSender);
  const invalidSender = router.prepareRequest(JSON.stringify({
    id: "req-1",
    method: "thread/read",
  }), null, defaultResponseSender);

  assert.equal(notification, JSON.stringify({
    method: "thread/changed",
    params: { threadId: "thread-1" },
  }));
  assert.equal(invalidSender, JSON.stringify({
    id: "req-1",
    method: "thread/read",
  }));
});


test("createAsyncResponseRouter rewrites async helper errors back to the original id", () => {
  const helperResponses = [];
  const defaultResponseSender = () => {};
  const helperResponseSender = (message) => {
    helperResponses.push(JSON.parse(message));
  };
  const router = createAsyncResponseRouter({
    createRequestId: () => "async-helper:error-1",
  });

  router.prepareRequest(JSON.stringify({
    id: "same-id",
    method: "turn/start",
    params: { threadId: "thread-1" },
  }), helperResponseSender, defaultResponseSender);

  assert.equal(
    router.routeResponse(JSON.stringify({
      id: "async-helper:error-1",
      error: {
        code: -32001,
        message: "helper failed",
      },
    })),
    true
  );
  assert.deepEqual(helperResponses, [{
    id: "same-id",
    error: {
      code: -32001,
      message: "helper failed",
    },
  }]);
});
