/* Drives the ElevenReader web app (https://elevenreader.io) the way a person would, with real CDP mouse events:
 *  - "Open PDF": a PDF is imported once (Library → Import → choose the file → Upload → open the new entry), and its
 *    read page ("/reader/library/<read ID>") is opened directly afterwards;
 *  - "Read from here": the user has already opened the PDF's read page; there, "Read options → Find in text" locates
 *    a sentence, and clicking its first word makes ElevenReader read aloud from there. Chrome counts that click as a
 *    user gesture, so the audio may start.
 * Zotero polls the page instead of the page polling itself: Chrome throttles timers in a hidden page (for example
 * while the user works in Zotero during a long PDF import) down to about once a minute. */
class ReadNotOpenError extends Error {}
class SelectionNotFoundError extends Error {}
class SelectionAmbiguousError extends Error {}

class ElevenReaderWeb {
  static ORIGIN = "https://elevenreader.io";
  static LIBRARY_URL = "https://elevenreader.io/reader/library";
  static READ_PATH = /^\/reader\/library\/[^/]+$/;
  static READ_LOAD_TIMEOUT_MS = 30000;
  static DIALOG_WAIT_MS = 3000;
  // ElevenReader extracts the words of an uploaded file before the entry can be opened; long PDFs take minutes.
  static FILE_PROCESSING_TIMEOUT_MS = 600000;

  constructor(browser) {
    this._browser = browser;
  }

  /** Opens the read of the local file at `path` and returns it: the recorded read at `readPath` while it still opens,
   *  otherwise (never imported, or deleted in ElevenReader) a new import of the file. */
  async open(path, readPath) {
    if (readPath) {
      const tab = new ElevenReaderTab(await this._browser.openPage(ElevenReaderWeb.ORIGIN + readPath));
      if (await tab.waitFor("readPath", {}, ElevenReaderWeb.READ_LOAD_TIMEOUT_MS)) return new ElevenReaderRead(tab, readPath);
    }
    return this._import(path);
  }

  /** Returns the read already open in a Chrome tab, as it is: the tab showing `readPath` (the attachment's recorded
   *  read, if any) when there is one, otherwise the first tab showing any ElevenReader read. Nothing is imported or
   *  loaded again. */
  async openedRead(readPath) {
    const page = await this._browser.findPage(ElevenReaderWeb.LIBRARY_URL, (urls) => {
      const reads = urls.filter(url => url.startsWith(`${ElevenReaderWeb.ORIGIN}/`) && ElevenReaderWeb.READ_PATH.test(new URL(url).pathname));
      return reads.find(url => new URL(url).pathname === readPath) ?? reads[0];
    });
    if (!page) throw new ReadNotOpenError("No Chrome tab shows an ElevenReader read page (elevenreader.io/reader/library/…).");
    const tab = new ElevenReaderTab(page);
    return new ElevenReaderRead(tab, await tab.find("readPath", {}, ElevenReaderWeb.READ_LOAD_TIMEOUT_MS));
  }

  async _import(path) {
    // A fresh library page, so no Import dialog is left open from an earlier attempt.
    const tab = new ElevenReaderTab(await this._browser.openPage(ElevenReaderWeb.LIBRARY_URL, { reload: true }));
    await this._openImportDialog(tab);
    await tab.page.setFileInputFiles('[role="dialog"] input[type="file"]', [path]);
    const upload = await tab.find("uploadButton");
    // By now the library behind the dialog has rendered; the new entry is the newest one, which this snapshot does
    // not account for.
    const newEntry = { entriesBefore: await tab.ask("entryFingerprints") };
    await tab.page.click(upload);
    await tab.find("newEntryTitle", newEntry, ElevenReaderWeb.FILE_PROCESSING_TIMEOUT_MS);
    // The user may have gone back to Zotero during the processing, and Chrome renders nothing in a window that is
    // completely covered, so Chrome comes to the front before the title is measured again and clicked.
    await tab.page.bringToFront();
    await tab.page.click(await tab.find("newEntryTitle", newEntry));
    return new ElevenReaderRead(tab, await tab.find("readPath"));
  }

  /** A freshly loaded page shows the server-rendered Import button before its click handler is attached, so Import
   *  is clicked again until the dialog opens. */
  async _openImportDialog(tab) {
    const deadline = Date.now() + ElevenReaderTab.STEP_TIMEOUT_MS;
    for (;;) {
      await tab.page.click(await tab.find("importButton"));
      if (await tab.waitFor("importDialog", {}, ElevenReaderWeb.DIALOG_WAIT_MS)) return;
      if (Date.now() > deadline) throw ElevenReaderTab.notShown("importDialog", ElevenReaderTab.STEP_TIMEOUT_MS);
    }
  }
}

/** A read open in ElevenReader's read page. */
class ElevenReaderRead {
  // Find in text matches literally (only case is ignored), and text extracted by Zotero and by ElevenReader can
  // differ later in a sentence (hyphenation, footnote marks), so ever shorter beginnings of the selection are tried.
  static QUERY_WORD_COUNTS = [12, 6, 3];
  static FIND_CLEAR_TIMEOUT_MS = 3000;
  static FIND_RESULT_TIMEOUT_MS = 10000;

  constructor(tab, path) {
    this._tab = tab;
    this.path = path;
  }

  /** Finds the beginning of `text` with "Find in text" and clicks its first word, so ElevenReader reads from there.
   *  The beginning must occur exactly once: the page offers no way to tell which of several matches was selected. */
  async readFrom(text) {
    // Chrome renders nothing in a completely covered window, and Find in text needs rendering to scroll the match
    // into view, so Chrome comes to the front first.
    await this._tab.page.bringToFront();
    // Compatibility composition turns ligatures such as "ﬁ" from PDF text into plain letters; Find in text does
    // not merge whitespace, so words are joined by single spaces.
    const words = text.normalize("NFKC").split(/\s+/).filter(Boolean);
    const counts = [...new Set(ElevenReaderRead.QUERY_WORD_COUNTS.map(count => Math.min(count, words.length)))];
    for (const count of counts) {
      const query = words.slice(0, count).join(" ");
      const { total } = await this._findInText(query);
      // A shorter beginning only matches more often, so several matches end the search.
      if (total > 1) throw new SelectionAmbiguousError(query);
      if (total === 1) {
        await this._tab.page.click(await this._tab.findSettled("currentMatchFirstWord"));
        return;
      }
    }
    throw new SelectionNotFoundError(words.slice(0, counts[counts.length - 1]).join(" "));
  }

  close() {
    return this._tab.page.detach();
  }

  /** Searches `query` in the Find in text box and returns { total } with its number of matches. ElevenReader shows
   *  the box again with the previous query, its counter and its marked match, so the box is emptied first, and the
   *  query is typed only once nothing of the previous search is left: otherwise the counter and the marked match of
   *  the previous query would be read as the result of this one. */
  async _findInText(query) {
    const closeButton = await this._tab.ask("findCloseButton");
    if (closeButton) await this._tab.page.click(closeButton);
    await this._tab.page.click(await this._tab.find("readOptionsButton"));
    await this._tab.page.click(await this._tab.find("findMenuItem"));
    await this._tab.page.click(await this._tab.find("findInput"));
    await this._tab.page.clearFocusedField();
    await this._tab.find("findCleared", {}, ElevenReaderRead.FIND_CLEAR_TIMEOUT_MS);
    await this._tab.page.insertText(query);
    return this._tab.find("findResult", {}, ElevenReaderRead.FIND_RESULT_TIMEOUT_MS);
  }
}

/** A Chrome tab showing ElevenReader, queried through the page function elevenReaderPage. */
class ElevenReaderTab {
  static POLL_MS = 250;
  static STEP_TIMEOUT_MS = 90000;

  constructor(page) {
    this.page = page;
  }

  /** Asks the page once. */
  ask(command, args = {}) {
    return this.page.call(elevenReaderPage, command, args);
  }

  /** Asks the page until it answers, or returns null after `timeoutMs`. */
  async waitFor(command, args, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const answer = await this.ask(command, args);
      if (answer || Date.now() > deadline) return answer;
      await Zotero.Promise.delay(ElevenReaderTab.POLL_MS);
    }
  }

  /** Like waitFor, but a missing answer is an error. */
  async find(command, args = {}, timeoutMs = ElevenReaderTab.STEP_TIMEOUT_MS) {
    const answer = await this.waitFor(command, args, timeoutMs);
    if (!answer) throw ElevenReaderTab.notShown(command, timeoutMs);
    return answer;
  }

  /** Like find, but waits until two answers in a row are the same point. After Find in text, ElevenReader keeps
   *  scrolling for up to about 1.5 s until the match rests 20 % below the top of the window. */
  async findSettled(command) {
    const deadline = Date.now() + ElevenReaderTab.STEP_TIMEOUT_MS;
    let previous = null;
    for (;;) {
      const answer = await this.ask(command);
      if (answer && previous && answer.x === previous.x && answer.y === previous.y) return answer;
      if (Date.now() > deadline) throw ElevenReaderTab.notShown(command, ElevenReaderTab.STEP_TIMEOUT_MS);
      previous = answer;
      await Zotero.Promise.delay(ElevenReaderTab.POLL_MS);
    }
  }

  static notShown(command, timeoutMs) {
    return new Error(`The ElevenReader page did not show "${command}" within ${timeoutMs / 1000} s. Check that ElevenReader is signed in in this Chrome.`);
  }
}

/** Runs inside the ElevenReader page (sent as source text by ChromePage.call), so it must stay self-contained.
 *  Element commands look for their element once: when it is present and ready (each finder defines what ready
 *  means), it is scrolled into view and the viewport point at its centre is returned; otherwise null. Value commands
 *  return their value, or null while it is not available yet. */
function elevenReaderPage(command, { entriesBefore } = {}) {
  // Only letters and digits are kept, because the library list re-flows the whitespace and punctuation of an entry.
  const fingerprint = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const visibleButtons = (root, label) => [...root.querySelectorAll("button")]
    .filter(button => button.checkVisibility() && button.innerText.trim() === label);
  // A library entry is the largest ancestor of a Play button that contains no other Play button. The climb stops
  // below the container that also holds the Import button, so with a single entry it cannot take in the whole page.
  const entries = () => {
    const importButton = visibleButtons(document, "Import")[0];
    return visibleButtons(document, "Play").map((play) => {
      let entry = play;
      while (!entry.parentElement.contains(importButton) && visibleButtons(entry.parentElement, "Play").length === 1) entry = entry.parentElement;
      return { entry, play, fingerprint: fingerprint(entry.innerText) };
    });
  };
  const searchBox = () => document.querySelector('[role="search"]');
  // The counter shows "1 of 3" when the query matches and "No results" when it does not.
  const findCounter = /\d+\s+of\s+(\d+)|No results/;
  const values = {
    // Newest first.
    entryFingerprints: () => entries().map(entry => entry.fingerprint),
    // The read page has loaded once its words (one span per word, "c" = character offset) are shown.
    readPath: () => (/^\/reader\/library\/[^/]+$/.test(location.pathname) && document.querySelector("#preview-content span[c]") ? location.pathname : null),
    findResult: () => {
      const match = findCounter.exec(searchBox()?.innerText ?? "");
      if (!match) return null;
      return { total: match[1] ? Number(match[1]) : 0 };
    },
    // The emptied box shows no counter, and no word is marked as the current match any more.
    findCleared: () => searchBox()?.querySelector("input")?.value === ""
      && !findCounter.test(searchBox().innerText)
      && !document.querySelector("#preview-content span[data-find-current]"),
    // Find in text marks the words of the current match; the first in document order starts the sentence.
    // Measured without scrolling, because ElevenReader scrolls the match into place itself.
    currentMatchFirstWord: () => {
      const word = document.querySelector("#preview-content span[data-find-current]");
      if (!word) return null;
      const box = word.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    },
  };
  const finders = {
    importButton: () => visibleButtons(document, "Import")[0],
    importDialog: () => document.querySelector('[role="dialog"] input[type="file"]'),
    uploadButton: () => document.querySelector('[role="dialog"] button[type="submit"]:not(:disabled)'),
    // The upload adds one entry at the top of the newest-first list. It is recognized by position and by being
    // shown more often than in the snapshot taken before the upload, not by its title: ElevenReader first shows the
    // file name and later replaces it with the title it recognizes in the PDF. Comparing fingerprints rather than DOM
    // nodes survives the library list re-rendering its entries. The Play button stays disabled while ElevenReader
    // processes the upload; the title opens the read page.
    newEntryTitle: () => {
      const shown = entries();
      if (shown.length === 0) return null;
      const [{ entry, play, fingerprint: newest }] = shown;
      const occurrences = list => list.filter(value => value === newest).length;
      if (occurrences(shown.map(item => item.fingerprint)) <= occurrences(entriesBefore)) return null;
      return play.disabled ? null : entry.querySelector("h3");
    },
    readOptionsButton: () => [...document.querySelectorAll('button[aria-label="Read options"]')].find(button => button.checkVisibility()),
    findMenuItem: () => [...document.querySelectorAll('[role="menuitem"]')].find(item => item.innerText.trim() === "Find in text"),
    findInput: () => searchBox()?.querySelector("input"),
    findCloseButton: () => searchBox()?.querySelector('button[aria-label="Close find"]'),
  };
  if (command in values) return values[command]();
  const element = finders[command]();
  if (!element) return null;
  element.scrollIntoView({ block: "center" });
  const box = element.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
