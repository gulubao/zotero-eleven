# Installation

This guide starts from a computer with nothing installed for this project. It covers four things:

1. Getting the build tool [`uv`](https://docs.astral.sh/uv/).
2. Building the plugin file (`.xpi`).
3. Installing the plugin in Zotero.
4. Preparing Google Chrome and ElevenReader.

If you already have a released `zotero-eleven-<version>.xpi` file, skip to [step 3](#3-install-the-plugin-in-zotero).

Replace `/absolute/path/to/zotero-eleven` below with the real folder of this project, for example
`/home/alice/Documents/tools/zotero-eleven`. Absolute paths make the commands work from any current directory.

## 1. Install uv

`uv` manages Python versions and the project's virtual environment.

- Linux and macOS:

  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

- Windows (PowerShell):

  ```powershell
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```

Open a new terminal afterwards, then check:

```bash
uv --version
```

## 2. Build the plugin

### 2a. Standard setup with `uv sync`

`pyproject.toml` describes the build environment. The build script uses only Python's standard library, so there is
nothing extra to download.

```bash
uv sync --project /absolute/path/to/zotero-eleven
```

```bash
uv run --project /absolute/path/to/zotero-eleven python /absolute/path/to/zotero-eleven/scripts/build.py
```

The second command prints the paths it wrote:

```
Built /absolute/path/to/zotero-eleven/build/zotero-eleven-0.1.0.xpi
Wrote /absolute/path/to/zotero-eleven/build/update.json
```

### 2b. Manual setup without `uv sync`

Use this if `uv sync` is unavailable, or if you want to see each step.

1. Install a Python interpreter managed by uv (any version 3.10 or later works):

   ```bash
   uv python install 3.12
   ```

2. Create the virtual environment `.venv` inside the project folder:

   ```bash
   uv venv --python 3.12 /absolute/path/to/zotero-eleven/.venv
   ```

3. Activate it (Linux and macOS; on Windows run `\absolute\path\to\zotero-eleven\.venv\Scripts\activate`):

   ```bash
   source /absolute/path/to/zotero-eleven/.venv/bin/activate
   ```

4. Build:

   ```bash
   python /absolute/path/to/zotero-eleven/scripts/build.py
   ```

There are no packages to add with `uv add`. Any future dependency would be listed in `pyproject.toml`.

## 3. Install the plugin in Zotero

1. Start Zotero (version 8 or later).
2. Open **Tools → Plugins**.
3. Click the gear icon at the top right and choose **Install Plugin From File…**.
4. Choose `build/zotero-eleven-<version>.xpi`.
5. "Zotero → ElevenReader" now appears in the plugin list. No restart is needed.

To update, install the newer `.xpi` file the same way. To remove the plugin, use **Remove** in the same list.

## 4. Prepare Google Chrome and ElevenReader

1. Use Google Chrome 144 or later. Check the version at `chrome://settings/help`.
2. Open `chrome://inspect/#remote-debugging` in Chrome and turn on
   **Allow remote debugging for this browser instance**. The page then shows a line like
   `Server running at: 127.0.0.1:9222`. Chrome remembers this setting after it restarts. If the port is not 9222,
   set it in the plugin (see [RUN.md](RUN.md#settings)).
3. Open <https://elevenreader.io> in the same Chrome and sign in.
4. macOS only: Chrome reads PDF files itself. The first time it reads a PDF from a protected folder (Documents,
   Desktop, Downloads, iCloud Drive, external or network drives), macOS asks whether Google Chrome may access it;
   click **Allow**. If you denied it earlier, turn it on in **System Settings → Privacy & Security → Files & Folders →
   Google Chrome**.

The plugin is ready. Continue with [RUN.md](RUN.md).
