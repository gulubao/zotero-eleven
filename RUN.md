# Running and using the plugin

Complete [INSTALL.md](INSTALL.md) first. You need the plugin installed in Zotero, Chrome remote debugging turned on,
and ElevenReader signed in in Chrome.

The plugin imports each PDF into ElevenReader once and reuses it afterwards. The usual order is: open (import) the
paper in ElevenReader, then read in Zotero and send sentences to ElevenReader whenever you want to listen.

## Workflow 1: open (and, the first time, import) a paper's PDF in ElevenReader

1. In the Zotero library, right-click a paper in the item list. It can be a regular item that has a PDF attachment, or
   the PDF attachment itself. Select exactly one item; the menu item is hidden otherwise.
2. Choose **Open PDF in ElevenReader**. For a regular item with several PDFs, the plugin uses the PDF that Zotero
   opens when you double-click the item.
3. The first time in each Zotero session, Chrome shows a dialog asking whether to allow remote debugging.
   Click **Allow** within about 20 seconds; Zotero stops waiting for the connection after that.
4. If this PDF was never imported, the plugin uploads it. ElevenReader first extracts the words; its library entry
   shows "Reading PDF" and then "Extracting words (…s)". This takes seconds for a short PDF and can take a few minutes
   for a long one; the plugin waits up to 10 minutes. Then the plugin opens the new entry, and records it.
5. If the PDF was imported before, the plugin opens its ElevenReader read page directly.

A notice at the bottom right of Zotero shows the progress. When the request ends, a new notice shows the result:
for 4 seconds on success, or for 20 seconds with a red line and an explanation if a step failed. Click a notice to
close it; closing the progress notice does not hide the result.

## Workflow 2: read aloud from a selected sentence

1. Open the paper's PDF in Zotero's reader and select text that starts where you want ElevenReader to begin, best at
   the start of a sentence in the main text.
2. Click **Read from here in ElevenReader** in the selection popup, or right-click inside the selection and choose the
   same item.
3. The plugin does not import or open anything: it uses the ElevenReader read page that is already open in Chrome
   (open it first with Workflow 1). If several read pages are open, it uses the one recorded for this PDF, otherwise
   the first one; if none is open, it stops and asks you to open the PDF first. It brings that tab to the front, opens **⋯ (Read options) → Find in text**, and searches for the first 12
   words of the selection. If ElevenReader finds no match, it tries the first 6 words, then the first 3. If a
   beginning matches more than once, the plugin stops and asks you to select a longer passage, because the page
   cannot tell which occurrence you selected.
4. When a beginning matches exactly once, the plugin waits until ElevenReader has scrolled the match into place,
   clicks its first word, and ElevenReader reads aloud from there. Stop it in ElevenReader whenever
   you like. The Find in text box stays open with the match highlighted.

Requests from both workflows run one after another, never at the same time. A request that waits for an earlier one
shows "Waiting for the previous ElevenReader request to finish…" until its turn comes.

For Workflow 1 the PDF file must be on this computer. If Zotero has not downloaded it yet (for example, it is only in Zotero
storage online), open it in Zotero once or sync it first.

## Where imported PDFs are recorded

The file `zotero-eleven-reads.json` in the Zotero data directory (Zotero **Settings → Advanced → Files and Folders →
Data Directory Location**) maps each imported attachment (`"<library ID>/<attachment key>"`) to its ElevenReader read
address (`"/reader/library/<read ID>"`). If a recorded read no longer opens within 30 seconds (for example because
you deleted it in ElevenReader), the plugin imports the PDF again and records the new read. To make the plugin forget
every import, delete this file while Zotero is closed.

## What happens step by step inside Chrome

| Step | What the plugin does in Chrome |
|---|---|
| 1 | Connects to `ws://127.0.0.1:<port>/devtools/browser` with the Chrome DevTools Protocol and waits for your **Allow** (on macOS it first opens the ElevenReader page with `open -a`, because Chrome shows the dialog in a browser window and on macOS may be running without one) |
| 2 | Opening: uses the first `https://elevenreader.io` tab (or opens a new one), brings it to the front, and loads the recorded read page there, or the library page when the PDF must be imported. Reading: uses the tab already showing a read page (`/reader/library/<read ID>`), preferring this PDF's recorded read, brings it to the front and does not load it again |
| 3 | Import only: clicks **Import** (again every 3 s until the dialog opens, because a freshly loaded page ignores early clicks), chooses the PDF file in the dialog's file input, records the library entries that exist now, and clicks **Upload** |
| 4 | Import only: waits until a new entry appears at the top of the library list and its **Play** button is enabled (up to 10 minutes), brings Chrome to the front again, and clicks the entry's title, which opens its read page. The entry is recognized by its position, not by its title, because ElevenReader first shows the file name and later replaces it with the title it recognizes in the PDF |
| 5 | Reading only: brings Chrome to the front, closes an open Find in text box, opens **⋯ (Read options) → Find in text**, types the beginning of the selection, and waits for "1 of N" or "No results" |
| 6 | Reading only: with exactly one match, waits until the match's first word stops moving (ElevenReader scrolls it to 20 % below the top) and clicks it |

## Starting Chrome

Before connecting, the plugin checks whether Chrome's remote-debugging server answers on the configured port
(`remoteDebuggingPort`, normally 9222). If nothing answers (Chrome is not running), it starts Chrome at the ElevenReader library page and
waits up to 30 seconds. Chrome keeps the remote-debugging setting across restarts, so no extra step is needed. If the
server answers but the connection is then refused (for example, **Allow** was not clicked), the plugin reports this
at once and does not start Chrome again.

## Settings

The plugin has two settings. Change them only if the defaults do not match your Chrome. To change one, open Zotero
**Settings → Advanced → Config Editor**, search for the name, and double-click it.

| Setting name | Meaning | Default |
|---|---|---|
| `extensions.zotero-eleven.remoteDebuggingPort` | Port of Chrome's remote-debugging server, as shown at `chrome://inspect/#remote-debugging` ("Server running at: 127.0.0.1:<port>") | `9222`, Chrome's own default |
| `extensions.zotero-eleven.chromeExecutable` | Program used to start Chrome when it is not running, and on macOS to bring it to the front. On macOS this is the application name given to `open -a`. | Empty, meaning Linux: `/usr/bin/google-chrome`; macOS: `Google Chrome`; Windows: `%ProgramFiles%\Google\Chrome\Application\chrome.exe` (a per-user install lives in `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`; set this setting then) |

For example, a Chrome Beta user would set `chromeExecutable` to `/usr/bin/google-chrome-beta` on Linux, or to
`Google Chrome Beta` on macOS.

## Build command

The build script takes no `--` options:

```bash
uv run --project /absolute/path/to/zotero-eleven python /absolute/path/to/zotero-eleven/scripts/build.py
```

It always reads the version from `addon/manifest.json`. It writes `build/zotero-eleven-<version>.xpi` and
`build/update.json`. See the release steps in [README.md](README.md#building-a-release-that-zotero-can-install).

This project is a plugin, not an experiment pipeline, so there are no comparison or ablation runs.

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| "Zotero could not control Chrome…" together with "No Chrome remote-debugging server answered on 127.0.0.1:<port> within 30 s." | Remote debugging is off, Chrome uses another port, or Chrome could not be started. Turn it on at `chrome://inspect/#remote-debugging` and compare the port shown there with `remoteDebuggingPort`. If Chrome is installed elsewhere or you use another Chrome channel, set `chromeExecutable` (see Settings). |
| "/usr/bin/open returned exit status 1" (macOS) | macOS has no application with the name in `chromeExecutable` (default `Google Chrome`). Set it to the name of your Chrome application as shown in the Applications folder, without `.app`. |
| A PDF import fails in ElevenReader on macOS, or macOS asks whether "Google Chrome" may access a folder | Chrome reads the PDF itself and needs macOS permission for protected folders (Documents, Desktop, Downloads, iCloud Drive, external or network drives). Allow it, or turn it on in **System Settings → Privacy & Security → Files & Folders → Google Chrome**, then try again. |
| "Zotero could not control Chrome…" together with "…connection … ended (status …)" | The **Allow** dialog was not answered within about 20 seconds, or it was denied. Start the request again and click **Allow** promptly. |
| "The Chrome tab was closed while Zotero was using it." | The ElevenReader tab was closed during a request. Start the request again. |
| "The ElevenReader page did not show "importButton" …" | ElevenReader is not signed in in that Chrome, or the page did not finish loading. Sign in at <https://elevenreader.io> and try again. |
| "The ElevenReader page did not show "newEntryTitle" …" | The upload did not produce a finished library entry within 10 minutes: the PDF may be too large for ElevenReader, extraction failed, or your plan's limit is reached. Look at the ElevenReader tab for its message. |
| ""Read from here" works in the PDF already open in ElevenReader…" | No Chrome tab shows an ElevenReader read page (`elevenreader.io/reader/library/<read ID>`). Open the paper first with **Open PDF in ElevenReader**, wait for its read page, then select the sentence again. |
| "ElevenReader's "Find in text" did not find the beginning of the selection…" | Even the first 3 selected words do not occur in ElevenReader's text of this PDF, usually because the selection starts in a heading, formula, footnote or figure, or with a word split across lines. Select text that starts at a word of the main text. |
| "The beginning of the selection occurs more than once…" | The selected words also occur elsewhere in the paper, or only a short beginning matched. Select a longer passage that starts at a word of the main text. |
| "The ElevenReader page did not show "readOptionsButton" / "findMenuItem" / "findInput" …" | The read page did not show the **⋯ (Read options)** menu or its **Find in text** item. ElevenReader may have changed its page; check whether the menu still exists. |
| "The PDF file of this item is not on this computer…" | Zotero knows the attachment but the file is not downloaded. Open or sync the PDF in Zotero, then try again. |
| No **Read from here in ElevenReader** button or menu item in the reader | No text is selected, or the open document is not a PDF (EPUB files and web snapshots are not supported). |
| No **Open PDF in ElevenReader** item in the library's right-click menu | More than one item is selected, or the selected item has no PDF attachment (notes, web snapshots and EPUB files are not offered here). |
| Each request asks for **Allow** again | Zotero or Chrome was restarted, or Chrome closed the connection. This is expected: Chrome asks once per new connection. |
