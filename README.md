# Zotero → ElevenReader

[中文说明 (Chinese)](README-CN.md)

A Zotero plugin that reads papers aloud with **ElevenReader** (the text-to-speech reading app by ElevenLabs). It uses
your own, already signed-in Google Chrome and the ElevenReader web app. Each PDF is imported into ElevenReader
**once**; after that, the plugin only opens it there and jumps to the sentence you selected.

- **Open PDF in ElevenReader**: in the library's item list, right-click a paper. The plugin imports the paper's PDF
  into ElevenReader the first time, and opens it in ElevenReader's reader every time.
- **Read from here in ElevenReader**: in Zotero's PDF reader, select a sentence and click this button in the
  selection popup (or choose it from the right-click menu). The paper must already be open in ElevenReader in Chrome
  (with **Open PDF in ElevenReader**). The plugin finds the sentence there with ElevenReader's own **Find in text**,
  and clicks its first word, so ElevenReader reads aloud from there until you stop it.
- Uses your normal Chrome window and your normal ElevenReader account. No separate browser profile is needed, and no
  extra Chrome extension is installed.
- Developed with Zotero 11.0-beta.4 (Linux, Ubuntu 24.04) and Google Chrome 157; written for Zotero 8 – 11 on Linux,
  macOS and Windows.

## How it works

```
Zotero ──(PDF file, selected sentence)──▶ plugin ──Chrome DevTools Protocol, local WebSocket──▶ your running Chrome
                                                                                                  │
   first time:  elevenreader.io/reader/library  Import → choose the PDF → Upload → open the new entry
   every time:  elevenreader.io/reader/library/<read ID>  ⋯ → Find in text → click the sentence's first word
```

1. Since version 144, Google Chrome can expose a **remote-debugging server** for the running browser. You turn it on at
   `chrome://inspect/#remote-debugging`. Chrome then listens only on `127.0.0.1`, normally on port 9222 (the page
   shows the port).
2. The plugin connects to that port with the **Chrome DevTools Protocol (CDP)**, the protocol Chrome's own developer
   tools use. Chrome asks you to **Allow** the connection; on macOS the plugin first opens the ElevenReader page with `open -a`, which gives Chrome a
   window for the dialog and brings it to the front. The plugin keeps that one connection open while Zotero runs, so Chrome asks again only after
   Zotero or Chrome restarts.
3. **Import (once per PDF).** On the ElevenReader library page the plugin clicks **Import**, chooses the PDF file in the
   dialog, clicks **Upload**, waits until ElevenReader has extracted the PDF's words, and opens the new entry. The
   entry's address (`/reader/library/<read ID>`) is recorded in `zotero-eleven-reads.json` in the Zotero data directory,
   keyed by the Zotero attachment. If that ElevenReader entry is deleted later, the next request imports the PDF again.
4. **Reading from a sentence.** On the read page already open in Chrome (this PDF's recorded read if it is open,
   otherwise the first open read page) the plugin opens **⋯ (Read options) → Find in text**, searches
   for the beginning of the selected text (its first 12 words, then 6, then 3 if the longer beginning is not found),
   and, when that beginning occurs exactly once, clicks the first word of the match. These are real browser input events, so Chrome treats the click as a user
   action and allows the audio to start.

If Chrome is not running, the plugin starts it with the ElevenReader library page and waits up to 30 seconds for the
remote-debugging server.

## Requirements

| Component | Requirement |
|---|---|
| Zotero | 8, 9, 10 or 11 |
| Google Chrome | 144 or later, with remote debugging turned on at `chrome://inspect/#remote-debugging` |
| ElevenReader | An account, signed in at <https://elevenreader.io> in that Chrome |
| Building the plugin | [`uv`](https://docs.astral.sh/uv/) and Python 3.10 or later (standard library only) |

## Quick start

1. Build the plugin file `build/zotero-eleven-<version>.xpi` (see [INSTALL.md](INSTALL.md)), or download it from a release.
2. In Zotero: **Tools → Plugins →** gear icon **→ Install Plugin From File…** and choose the `.xpi` file.
3. In Chrome: open `chrome://inspect/#remote-debugging` and turn on
   **Allow remote debugging for this browser instance**. Sign in at <https://elevenreader.io>.
4. In Zotero, right-click a paper and choose **Open PDF in ElevenReader** to import it (once). Then select a sentence
   in Zotero's PDF reader and click **Read from here in ElevenReader**. When Chrome asks whether to allow the
   connection, click **Allow**.

Step-by-step usage, settings and troubleshooting are in [RUN.md](RUN.md).

## Building a release that Zotero can install

A Zotero plugin is a ZIP archive with the extension `.xpi`, with `manifest.json` at the top level.

```bash
uv run --project /absolute/path/to/zotero-eleven python /absolute/path/to/zotero-eleven/scripts/build.py
```

This writes two files:

- `build/zotero-eleven-<version>.xpi`: install it in Zotero with **Install Plugin From File…**.
- `build/update.json`: the update manifest Zotero downloads from `applications.zotero.update_url` in `manifest.json`
  to find new versions.

To publish version `X.Y.Z`:

1. Set `"version": "X.Y.Z"` in `addon/manifest.json`.
2. Run the build command above.
3. Create the GitHub release `vX.Y.Z` in `gulubao/zotero-eleven`, and attach both `zotero-eleven-X.Y.Z.xpi` and
   `update.json`. `update.json` links to the `.xpi` at `releases/download/vX.Y.Z/`, and `manifest.json` points
   Zotero to `releases/latest/download/update.json`.

## Security note

Turning on Chrome remote debugging lets local programs ask for full control of that Chrome, including its cookies and
site data. Chrome asks you before it accepts each connection. Allow it only when you have just asked Zotero to open a PDF or read
aloud. If you no longer want this, turn the setting off at `chrome://inspect/#remote-debugging`.

## Limitations

- The plugin finds ElevenReader's controls by their visible English labels (**Import**, **Upload**, **Play**,
  **Read options**, **Find in text**) and the page structure. If ElevenReader changes its web page, these steps may
  stop working, and the plugin then reports which step it could not find.
- Find in text matches the selected words literally (ignoring only upper and lower case). When ElevenReader extracted
  the sentence differently (for example a hyphenated word, a footnote mark, or a formula), only a shorter beginning may
  match. The plugin reads only from a beginning that occurs exactly once; when it occurs several times (common for
  3-word beginnings and very short selections), it asks you to select a longer passage instead of guessing.
- ElevenReader reads the PDF as it extracted it, which for papers usually includes headers, references and captions.
- Only PDF attachments are supported. A PDF imported before this plugin recorded it (for example by hand) is imported
  once more. Usage counts toward your ElevenReader plan.
- On macOS, Chrome reads the PDF file itself. If the PDF lies in a folder that macOS protects (Documents, Desktop,
  Downloads, iCloud Drive, or an external or network drive), macOS asks once whether Google Chrome may access it;
  allow it. Zotero's default storage folder `~/Zotero` is not protected.

## Project layout

```
addon/                      the plugin (packaged as-is into the .xpi)
  manifest.json             plugin identity and supported Zotero versions
  bootstrap.js              Zotero entry points: loads the classes below, starts and stops the plugin
  prefs.js                  default preferences (remote-debugging port and Chrome program)
  content/
    zotero-eleven.js        ZoteroEleven: wires the parts together, queues requests, shows progress in Zotero
    read-registry.js        ReadRegistry: which ElevenReader read belongs to which Zotero PDF attachment
    reader-integration.js   ReaderIntegration: "Read from here" in the PDF reader's selection popup and context menu
    library-integration.js  LibraryIntegration: "Open PDF in ElevenReader" in the library item context menu
    elevenreader-web.js     ElevenReaderWeb (open/import, opened read), ElevenReaderRead (Find in text, read from a word),
                            ElevenReaderTab (polling), elevenReaderPage (the function that runs in the page)
    chrome-browser.js       ChromeBrowser + ChromePage: finding, starting and attaching to the running Chrome
    cdp-connection.js       CDPConnection: Chrome DevTools Protocol client on Gecko's WebSocket channel
  locale/en-US, locale/zh-CN  user interface strings (Fluent)
scripts/build.py            builds build/*.xpi and build/update.json
```
