/* The user's own, already signed-in Google Chrome, controlled through the remote-debugging server that the user
 * switched on at chrome://inspect/#remote-debugging (Chrome 144 or later). Chrome keeps that switch across restarts
 * and then listens on 127.0.0.1 (port 9222 unless that port was taken; chrome://inspect shows the port). In this
 * mode it serves no /json HTTP endpoints, accepts WebSocket connections to /devtools/browser without the per-run
 * identifier, and asks the user to allow each new connection, so one connection is kept for the whole Zotero session.
 * Connecting by port avoids reading Chrome's DevToolsActivePort file, which macOS privacy protection (Transparency,
 * Consent and Control) blocks for other applications. */
class RemoteDebuggingUnavailableError extends Error {}

class ChromeBrowser {
  static LAUNCH_TIMEOUT_MS = 30000;
  static POLL_INTERVAL_MS = 1000;

  constructor(prefs) {
    this._prefs = prefs;
    this._connection = null;
  }

  /** The port of Chrome's remote-debugging server, as shown at chrome://inspect/#remote-debugging. */
  get port() {
    return this._prefs.get("remoteDebuggingPort");
  }

  /** The Chrome program: an executable path, or on macOS the application name given to `open -a`. */
  get executable() {
    const configured = this._prefs.get("chromeExecutable");
    if (configured) return configured;
    if (Zotero.isWin) return PathUtils.join(Services.env.get("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe");
    if (Zotero.isMac) return "Google Chrome";
    return "/usr/bin/google-chrome";
  }

  /** Shows `url` in a tab already showing it, else in the first tab of the same site (or a new tab), and brings that
   *  tab to the front. The tab is loaded again when it shows another page or when `reload` is set; otherwise a tab
   *  already showing `url` keeps its state. */
  async openPage(url, { reload = false } = {}) {
    const cdp = await this._connect(url);
    const { targetInfos } = await cdp.send("Target.getTargets");
    const sitePrefix = `${new URL(url).origin}/`;
    const pages = targetInfos.filter(target => target.type === "page");
    const existing = pages.find(target => target.url === url) ?? pages.find(target => target.url.startsWith(sitePrefix));
    const targetID = existing ? existing.targetId : (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId;
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: targetID, flatten: true });
    const page = new ChromePage(cdp, sessionId, () => this._activateApplication());
    await page.bringToFront();
    if (reload || existing?.url !== url) await page.navigate(url);
    return page;
  }

  close() {
    this._connection?.close();
    this._connection = null;
  }

  async _connect(launchURL) {
    if (this._connection && !this._connection.closed) return this._connection;
    // Starting Chrome helps only when no remote-debugging server is listening. A denied or unanswered Allow
    // dialog is reported at once instead of being retried, so Chrome does not ask the user again.
    if (await this._serverListening()) {
      // Chrome shows its Allow dialog in its last active browser window and refuses the connection when there is
      // none. On macOS Chrome keeps running without windows; opening a URL creates a window in the last used profile
      // (without the profile picker) and brings it in front, so the user sees the dialog. Elsewhere Chrome quits
      // with its last window, and the running Chrome has one.
      if (Zotero.isMac) await this._launch(launchURL);
    }
    else {
      this._launch(launchURL).catch(error => Zotero.logError(error));
      await this._waitForServer();
    }
    this._connection = await CDPConnection.open(`ws://127.0.0.1:${this.port}/devtools/browser`).catch((error) => {
      throw new RemoteDebuggingUnavailableError(error.message);
    });
    return this._connection;
  }

  /** The server answers any plain HTTP request (with 404, as it serves no /json endpoints in this mode), so a
   *  refused request means that no server is listening. */
  _serverListening() {
    return fetch(`http://127.0.0.1:${this.port}/json/version`).then(() => true, () => false);
  }

  async _waitForServer() {
    const deadline = Date.now() + ChromeBrowser.LAUNCH_TIMEOUT_MS;
    while (!(await this._serverListening())) {
      if (Date.now() > deadline) {
        throw new RemoteDebuggingUnavailableError(`No Chrome remote-debugging server answered on 127.0.0.1:${this.port} within ${ChromeBrowser.LAUNCH_TIMEOUT_MS / 1000} s.`);
      }
      await Zotero.Promise.delay(ChromeBrowser.POLL_INTERVAL_MS);
    }
  }

  /** Opens `url` in Chrome, starting Chrome when it is not running. Except on macOS, where `open` returns at once,
   *  the started process lives as long as a Chrome it had to start, so that caller does not wait for it. Being async,
   *  it also turns exec's synchronous errors (e.g. a missing program) into a rejection. */
  async _launch(url) {
    if (Zotero.isMac) await Zotero.Utilities.Internal.exec("/usr/bin/open", ["-a", this.executable, url]);
    else await Zotero.Utilities.Internal.exec(this.executable, [url]);
  }

  /** Brings the Chrome application in front of Zotero once a connection exists, so Chrome has a window. On macOS,
   *  activating a tab over CDP does not activate another application, and Chrome treats a window that Zotero covers
   *  completely as hidden, which slows the page down; `open -a` without a URL reopens the running application.
   *  Elsewhere activating the tab raises its window. */
  async _activateApplication() {
    if (Zotero.isMac) await Zotero.Utilities.Internal.exec("/usr/bin/open", ["-a", this.executable]);
  }
}

/** One Chrome tab attached over a flattened CDP session. */
class ChromePage {
  constructor(cdp, sessionID, activateApplication) {
    this._cdp = cdp;
    this._sessionID = sessionID;
    this._activateApplication = activateApplication;
  }

  /** Selects this tab in its window and brings Chrome in front of Zotero, so the user sees what happens. */
  async bringToFront() {
    await this._send("Page.bringToFront");
    await this._activateApplication();
  }

  async navigate(url) {
    await this._send("Page.enable");
    const loaded = this._cdp.nextEvent("Page.loadEventFired", this._sessionID);
    await this._send("Page.navigate", { url });
    await loaded;
  }

  /** Runs the synchronous `pageFunction` inside the tab and returns its JSON-serializable result. The function is
   *  sent as source text, so it must not refer to anything outside its own body. */
  async call(pageFunction, ...args) {
    const { result, exceptionDetails } = await this._send("Runtime.evaluate", {
      expression: `(${pageFunction})(...${JSON.stringify(args)})`,
      returnByValue: true,
    });
    // The first line of the description is "Error: <message>"; the rest is the page's stack trace.
    if (exceptionDetails) throw new Error(exceptionDetails.exception.description.split("\n")[0]);
    return result.value;
  }

  /** A real (trusted) left click at viewport coordinates; the page treats it as a user gesture, so audio may start. */
  async click({ x, y }) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await this._send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    }
  }

  /** Types `text` into the focused element as one input event. */
  insertText(text) {
    return this._send("Input.insertText", { text });
  }

  /** Chooses local files in the file input matched by `selector`, as if the user had picked them. Chrome reads
   *  the files itself, so the paths must exist on this computer and Chrome must be allowed to read them. */
  async setFileInputFiles(selector, paths) {
    const { result } = await this._send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})` });
    await this._send("DOM.setFileInputFiles", { files: paths, objectId: result.objectId });
  }

  detach() {
    return this._cdp.send("Target.detachFromTarget", { sessionId: this._sessionID });
  }

  _send(method, params = {}) {
    return this._cdp.send(method, params, this._sessionID);
  }
}
