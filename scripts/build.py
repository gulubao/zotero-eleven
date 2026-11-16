"""Package the Zotero plugin in addon/ as an installable .xpi and write update.json.

Usage:  uv run /abs/path/to/scripts/build.py
Output: build/zotero-eleven-<version>.xpi and build/update.json
"""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ADDON = ROOT / "addon"
BUILD = ROOT / "build"
REPOSITORY = "https://github.com/gulubao/zotero-eleven"


def build_xpi(manifest: dict) -> Path:
    xpi = BUILD / f"zotero-eleven-{manifest['version']}.xpi"
    with zipfile.ZipFile(xpi, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(ADDON.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(ADDON).as_posix())
    return xpi


def write_update_manifest(manifest: dict, xpi: Path) -> Path:
    zotero = manifest["applications"]["zotero"]
    update = {"addons": {zotero["id"]: {"updates": [{
        "version": manifest["version"],
        "update_link": f"{REPOSITORY}/releases/download/v{manifest['version']}/{xpi.name}",
        "update_hash": "sha256:" + hashlib.sha256(xpi.read_bytes()).hexdigest(),
        "applications": {"zotero": {
            "strict_min_version": zotero["strict_min_version"],
            "strict_max_version": zotero["strict_max_version"],
        }},
    }]}}}
    path = BUILD / "update.json"
    path.write_text(json.dumps(update, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> None:
    manifest = json.loads((ADDON / "manifest.json").read_text(encoding="utf-8"))
    BUILD.mkdir(exist_ok=True)
    xpi = build_xpi(manifest)
    update = write_update_manifest(manifest, xpi)
    print(f"Built {xpi}\nWrote {update}")


if __name__ == "__main__":
    main()
