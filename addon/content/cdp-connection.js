/* A Chrome DevTools Protocol (CDP) client that runs inside Zotero.
 *
 * Chrome accepts a remote-debugging WebSocket handshake that carries an `Origin` header only when it was
 * launched with `--remote-allow-origins`. A Chrome whose remote debugging was switched on at
 * chrome://inspect/#remote-debugging has no such flag, and the DOM `WebSocket` always sends `Origin`, so the
 * connection is opened on Gecko's lower-level WebSocket channel with an empty origin, which sends none. The
 * channel setup mirrors Firefox's own resource://gre/modules/PushServiceWebSocket.sys.mjs. */
class CDPConnection {
  /** Resolves once Chrome accepted the handshake (Chrome first asks the user to allow the connection). */
  static open(url) {
    const channel = Cc["@mozilla.org/network/protocol;1?name=ws"].createInstance(Ci.nsIWebSocketChannel);
    channel.initLoadInfo(
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_WEBSOCKET
    );
    channel.loadInfo.allowDeprecatedSystemRequests = true;
    const connection = new CDPConnection(channel);
    return new Promise((resolve, reject) => {
      let started = false;
      channel.asyncOpen(Services.io.newURI(url), "", {}, 0, {
        onStart() {
          started = true;
          resolve(connection);
        },
        onStop(_context, status) {
          const error = new Error(`The Chrome DevTools connection to ${url} ended (status 0x${(status >>> 0).toString(16)}).`);
          connection._terminate(error);
          if (!started) reject(error);
        },
        onServerClose() {
          connection._terminate(new Error("Chrome closed the DevTools connection."));
        },
        onMessageAvailable(_context, message) {
          connection._receive(message);
        },
        onAcknowledge() {},
        onBinaryMessageAvailable() {},
      }, null);
    });
  }

  constructor(channel) {
    this._channel = channel;
    this._nextID = 1;
    this._pending = new Map();
    this._eventWaiters = [];
    this.closed = false;
  }

  /** Resolves with the params of the next CDP event `method` sent for `sessionID`. */
  nextEvent(method, sessionID) {
    return new Promise((resolve, reject) => this._eventWaiters.push({ method, sessionID, resolve, reject }));
  }

  /** Sends one CDP command; `sessionID` addresses a page attached with Target.attachToTarget({flatten: true}). */
  send(method, params = {}, sessionID = undefined) {
    if (this.closed) throw new Error("The Chrome DevTools connection is closed.");
    const id = this._nextID++;
    const message = sessionID ? { id, method, params, sessionId: sessionID } : { id, method, params };
    return new Promise((resolve, reject) => {
      this._pending.set(id, { method, sessionID, resolve, reject });
      this._channel.sendMsg(JSON.stringify(message));
    });
  }

  close() {
    if (!this.closed) this._channel.close(Ci.nsIWebSocketChannel.CLOSE_NORMAL, "");
    this._terminate(new Error("The Chrome DevTools connection was closed by Zotero."));
  }

  _receive(text) {
    const message = JSON.parse(text);
    if (!("id" in message)) return this._dispatchEvent(message);
    const request = this._pending.get(message.id);
    this._pending.delete(message.id);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
  }

  _dispatchEvent({ method, params, sessionId }) {
    // Chrome never answers a session's pending commands once its tab is closed or detached.
    if (method === "Target.detachedFromTarget") this._failSession(params.sessionId, new Error("The Chrome tab was closed while Zotero was using it."));
    const waiters = this._eventWaiters.filter(waiter => waiter.method === method && waiter.sessionID === sessionId);
    this._eventWaiters = this._eventWaiters.filter(waiter => !waiters.includes(waiter));
    for (const waiter of waiters) waiter.resolve(params);
  }

  _failSession(sessionID, error) {
    for (const [id, request] of this._pending) {
      if (request.sessionID !== sessionID) continue;
      this._pending.delete(id);
      request.reject(error);
    }
    const waiters = this._eventWaiters.filter(waiter => waiter.sessionID === sessionID);
    this._eventWaiters = this._eventWaiters.filter(waiter => !waiters.includes(waiter));
    for (const waiter of waiters) waiter.reject(error);
  }

  _terminate(error) {
    this.closed = true;
    for (const request of this._pending.values()) request.reject(error);
    this._pending.clear();
    for (const waiter of this._eventWaiters) waiter.reject(error);
    this._eventWaiters = [];
  }
}
