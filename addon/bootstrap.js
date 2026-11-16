/* Zotero bootstrap entry points (Zotero 8 – 11). The plugin's classes are loaded into this scope in dependency order. */
const SCRIPTS = [
  "content/cdp-connection.js",
  "content/chrome-browser.js",
  "content/elevenreader-web.js",
  "content/read-registry.js",
  "content/reader-integration.js",
  "content/library-integration.js",
  "content/zotero-eleven.js",
];

var zoteroEleven;

async function startup({ id, rootURI }) {
  // Disabling and re-enabling the plugin reuses this scope, where the classes are already declared; declaring a
  // class again would throw a redeclaration SyntaxError. An upgrade or reinstall gets a fresh scope.
  if (typeof ZoteroEleven === "undefined") {
    // Plugins are loaded from jar:file: URIs, which the script loader otherwise refuses (Mozilla bug 1974213).
    for (const script of SCRIPTS) Services.scriptloader.loadSubScriptWithOptions(rootURI + script, { allowUnsafeURL: true });
  }
  zoteroEleven = new ZoteroEleven({ id });
  await zoteroEleven.startup();
}

function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) return;
  zoteroEleven.shutdown();
  zoteroEleven = undefined;
}

function install() {}

function uninstall() {}
