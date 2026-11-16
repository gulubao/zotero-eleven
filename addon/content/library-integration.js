/* Adds "Open PDF in ElevenReader" to the context menu of the Zotero library's item list. It is shown when exactly
 * one item is selected and that item is a PDF attachment or a regular item with a PDF attachment, and it hands over
 * the PDF that Zotero itself opens for that item.
 * Zotero removes menus registered with a plugin ID when that plugin shuts down. */
class LibraryIntegration {
  static MENU_ID = "open-pdf";

  constructor({ pluginID, label, onOpenPDF }) {
    this._pluginID = pluginID;
    this._label = label;
    this._onOpenPDF = onOpenPDF;
  }

  register() {
    Zotero.MenuManager.registerMenu({
      menuID: LibraryIntegration.MENU_ID,
      pluginID: this._pluginID,
      target: "main/library/item",
      menus: [{
        menuType: "menuitem",
        onShowing: (_event, context) => {
          context.menuElem.label = this._label();
          context.setVisible(LibraryIntegration._offersPDF(context.items));
        },
        // Zotero skips the plugin hooks when annotations are selected, so the item must not stay visible from
        // an earlier opening.
        onHidden: (_event, context) => context.setVisible(false),
        onCommand: async (_event, context) => {
          const [item] = context.items;
          // getBestAttachment() is the attachment a double-click opens; it ranks PDFs first.
          this._onOpenPDF(item.isRegularItem() ? await item.getBestAttachment() : item);
        },
      }],
    });
  }

  /** True for a single selected item that is a PDF attachment or has a PDF attachment that is not in the trash. */
  static _offersPDF(items) {
    if (items.length !== 1) return false;
    const [item] = items;
    if (item.isPDFAttachment()) return true;
    return item.isRegularItem() && Zotero.Items.get(item.getAttachments()).some(attachment => attachment.isPDFAttachment());
  }
}
