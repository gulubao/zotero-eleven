/* Adds "Read from here in ElevenReader" to the Zotero PDF reader:
 *  - a button in the popup that appears when text is selected, and
 *  - an item in the context menu opened by right-clicking the document while text is selected.
 * It hands over the reader's PDF attachment and the selected text. Zotero removes listeners registered with a
 * plugin ID when that plugin shuts down. */
class ReaderIntegration {
  constructor({ pluginID, label, onReadFrom }) {
    this._pluginID = pluginID;
    this._label = label;
    this._onReadFrom = onReadFrom;
  }

  register() {
    Zotero.Reader.registerEventListener("renderTextSelectionPopup", event => this._renderSelectionPopup(event), this._pluginID);
    Zotero.Reader.registerEventListener("createViewContextMenu", event => this._createViewContextMenu(event), this._pluginID);
  }

  _renderSelectionPopup({ reader, doc, params, append }) {
    if (reader.type !== "pdf") return;
    const text = params.annotation.text;
    const button = doc.createElement("button");
    // The same classes as the reader's own "Add to Note" button in this popup.
    button.className = "toolbar-button wide-button";
    button.textContent = this._label();
    button.addEventListener("click", () => this._onReadFrom(Zotero.Items.get(reader.itemID), text));
    append(button);
  }

  _createViewContextMenu({ reader, append }) {
    if (reader.type !== "pdf") return;
    const text = ReaderIntegration._selectedText(reader);
    // Zotero builds the menu item with toggleAttribute("disabled", item.disabled), which toggles the attribute
    // on when `disabled` is undefined, so it must be an explicit false.
    if (text) append({ label: this._label(), disabled: false, onCommand: () => this._onReadFrom(Zotero.Items.get(reader.itemID), text) });
  }

  /** The reader keeps the current text selection as the state behind its selection popup (null when nothing is
   *  selected); `primary` tells which of the two split views has focus. The reader API offers no public getter. */
  static _selectedText(reader) {
    const state = reader._internalReader._state;
    return (state.primary ? state.primaryViewSelectionPopup : state.secondaryViewSelectionPopup)?.annotation?.text;
  }
}
