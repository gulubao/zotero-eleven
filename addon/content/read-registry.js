/* Remembers which ElevenReader read belongs to which Zotero PDF attachment, so that every PDF is imported only once.
 * The record is a JSON file in the Zotero data directory, mapping "<library ID>/<attachment key>" to the read's
 * address path ("/reader/library/<read ID>"). */
class ReadRegistry {
  static FILE_NAME = "zotero-eleven-reads.json";

  constructor() {
    this._path = PathUtils.join(Zotero.DataDirectory.dir, ReadRegistry.FILE_NAME);
    this._reads = {};
  }

  async load() {
    if (await IOUtils.exists(this._path)) this._reads = await IOUtils.readJSON(this._path);
  }

  /** The recorded read path of `attachment`, or undefined when it was never imported. */
  get(attachment) {
    return this._reads[ReadRegistry._key(attachment)];
  }

  async set(attachment, readPath) {
    if (this.get(attachment) === readPath) return;
    this._reads[ReadRegistry._key(attachment)] = readPath;
    await IOUtils.writeJSON(this._path, this._reads);
  }

  static _key(attachment) {
    return `${attachment.libraryID}/${attachment.key}`;
  }
}
