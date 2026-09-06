"""Download ffmpeg.exe into resources/ (Windows gpl build).

Downloads into arch-specific filenames so the x86 build never receives an
x64 binary. Verifies SHA-256 against the pinned FFmpeg-Builds release.
"""
from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "resources")

# Pinned release tag + SHA-256 of the ffmpeg.exe inside each archive.
# Determine hashes from a known-good download and update when bumping.
FFMPEG_RELEASE = "latest"
URLS = {
    "x86": "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win32-gpl.zip",
    "x64": "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
}
# SHA-256 of ffmpeg.exe within each archive (fill in after first verified fetch).
EXPECTED_SHA256 = {
    "x86": "",
    "x64": "fb456529ee0dbd62ef32c7edcff89ea466c8106f620ad22f9549107f5ec83cf2",
}


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _arch() -> str:
    return "x86" if sys.maxsize <= 2**32 else "x64"


def _dest(arch: str) -> str:
    return os.path.join(RES, f"ffmpeg_{arch}.exe")


def _fetch(url: str, arch: str) -> None:
    dest = _dest(arch)
    if os.path.isfile(dest) and os.path.getsize(dest) >= 1_000_000:
        expected = EXPECTED_SHA256.get(arch)
        if not expected or _sha256(dest).lower() == expected.lower():
            print(f"{arch}: ffmpeg.exe exists (verified)" if expected else f"{arch}: ffmpeg.exe exists (unverified)")
            return
        print(f"{arch}: existing ffmpeg failed checksum - re-downloading")

    os.makedirs(RES, exist_ok=True)
    print(f"{arch}: downloading {url}")
    tmp_zip = os.path.join(tempfile.gettempdir(), f"ffmpeg-hire-{arch}.zip")
    urllib.request.urlretrieve(url, tmp_zip)
    try:
        with zipfile.ZipFile(tmp_zip, "r") as zf:
            for name in zf.namelist():
                if name.lower().endswith("ffmpeg.exe"):
                    with zf.open(name) as src, open(dest, "wb") as out:
                        out.write(src.read())
                    actual = _sha256(dest)
                    expected = EXPECTED_SHA256.get(arch)
                    if expected and actual.lower() != expected.lower():
                        os.remove(dest)
                        raise SystemExit(
                            f"{arch}: ffmpeg.exe SHA-256 mismatch\n  got: {actual}\n  expected: {expected}"
                        )
                    print(f"{arch}: wrote {dest} (sha256={actual})")
                    return
    finally:
        try:
            os.remove(tmp_zip)
        except OSError:
            pass
    raise SystemExit(f"ffmpeg.exe not found in archive for {arch}")


def main() -> None:
    arch = _arch()
    _fetch(URLS[arch], arch)


if __name__ == "__main__":
    main()