/* Zotero → ElevenReader. A PDF is imported into the ElevenReader web app once and then reused:
 *  - "Open PDF in ElevenReader" (library item menu) opens the PDF's read, importing it first if needed;
 *  - "Read from here in ElevenReader" (PDF reader selection) opens that read the same way and makes ElevenReader
 *    read aloud from the selected sentence.
 * This class wires the parts together, keeps the record of imported PDFs and reports progress in Zotero. */
class ZoteroEleven {
  static PREF_BRANCH = "extensions.zotero-eleven.";
  static FTL_FILE = "zotero-eleven.ftl";
  static SUCCESS_CLOSE_MS = 4000;
  static ERROR_CLOSE_MS = 20000;

  constructor({ id }) {
    this._l10n = new Localization([ZoteroEleven.FTL_FILE], true);
    this._reads = new ReadRegistry();
    this._browser = new ChromeBrowser({ get: name => Zotero.Prefs.get(ZoteroEleven.PREF_BRANCH + name, true) });
    this._elevenReader = new ElevenReaderWeb(this._browser);
    this._readerIntegration = new ReaderIntegration({
      pluginID: id,
      label: () => this._string("zotero-eleven-read-from-here"),
      onReadFrom: (attachment, text) => this.readFrom(attachment, text),
    });
    this._libraryIntegration = new LibraryIntegration({
      pluginID: id,
      label: () => this._string("zotero-eleven-open-pdf"),
      onOpenPDF: attachment => this.openPDF(attachment),
    });
    this._queue = Promise.resolve();
  }

  async startup() {
    await this._reads.load();
    this._readerIntegration.register();
    this._libraryIntegration.register();
  }

  shutdown() {
    this._browser.close();
  }

  openPDF(attachment) {
    return this._enqueue("open", async () => {
      const read = await this._showRead(attachment);
      await read.close();
    });
  }

  readFrom(attachment, text) {
    return this._enqueue("read", async () => {
      const read = await this._showRead(attachment);
      await read.readFrom(text);
      await read.close();
    });
  }

  /** Shows the attachment's read in ElevenReader and records it, so that a later request does not import it again. */
  async _showRead(attachment) {
    const path = await attachment.getFilePathAsync();
    if (!path) throw new Error(this._string("zotero-eleven-error-pdf-missing"));
    const read = await this._elevenReader.show(path, this._reads.get(attachment));
    await this._reads.set(attachment, read.path);
    return read;
  }

  /** Requests run one after another, so two quick clicks never use the same ElevenReader page at once. Each
   *  request shows its notice when it is queued, because an import ahead of it can take minutes. */
  _enqueue(kind, task) {
    const notice = this._notice(this._string("zotero-eleven-progress-waiting"));
    this._queue = this._queue.then(() => this._run(kind, task, notice));
    return this._queue;
  }

  /** Runs one request; `kind` ("open" or "read") selects the messages. The outcome gets a notice of its own, because
   *  the user may have clicked the progress notice away during a long import, and a closed notice shows nothing. */
  async _run(kind, task, notice) {
    notice.line.setText(this._string(`zotero-eleven-progress-working-${kind}`));
    notice.line.setProgress(50);
    try {
      await task();
    }
    catch (error) {
      notice.window.close();
      this._reportError(kind, error);
      return;
    }
    notice.window.close();
    const done = this._notice(this._string(`zotero-eleven-progress-done-${kind}`));
    done.line.setProgress(100);
    done.window.startCloseTimer(ZoteroEleven.SUCCESS_CLOSE_MS);
  }

  _reportError(kind, error) {
    const failed = this._notice(this._string(`zotero-eleven-progress-failed-${kind}`));
    failed.line.setError();
    if (error instanceof RemoteDebuggingUnavailableError) failed.window.addDescription(this._string("zotero-eleven-error-remote-debugging"));
    if (error instanceof SelectionNotFoundError) failed.window.addDescription(this._string("zotero-eleven-error-selection-not-found"));
    if (error instanceof SelectionAmbiguousError) failed.window.addDescription(this._string("zotero-eleven-error-selection-ambiguous"));
    failed.window.addDescription(error.message);
    failed.window.startCloseTimer(ZoteroEleven.ERROR_CLOSE_MS);
    Zotero.logError(error);
  }

  /** Shows a notice with one line of text; returns its window and that line. */
  _notice(text) {
    const progress = new Zotero.ProgressWindow({ closeOnClick: true });
    progress.changeHeadline(this._string("zotero-eleven-progress-headline"));
    const line = new progress.ItemProgress(null, text);
    progress.show();
    return { window: progress, line };
  }

  /** Zotero registers the plugin's locale/<language>/ folder for Fluent and provides Localization in the plugin scope. */
  _string(id) {
    return this._l10n.formatValueSync(id);
  }
}
