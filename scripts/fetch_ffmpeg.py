"""Download ffmpeg.exe into resources/ (Windows gpl build)."""
from __future__ import annotations

import os
import sys
import tempfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "resources", "ffmpeg.exe")
URL = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
# 32-bit machines still often run 64-bit ffmpeg fails — use essentials win32 if x86
if sys.maxsize <= 2**32:
    URL = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win32-gpl.zip"


def main() -> None:
    if os.path.isfile(DEST):
        print("ffmpeg.exe exists")
        return
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    print("Downloading", URL)
    tmp_zip = os.path.join(tempfile.gettempdir(), "ffmpeg-hire.zip")
    urllib.request.urlretrieve(URL, tmp_zip)
    with zipfile.ZipFile(tmp_zip, "r") as zf:
        for name in zf.namelist():
            if name.lower().endswith("ffmpeg.exe"):
                with zf.open(name) as src, open(DEST, "wb") as out:
                    out.write(src.read())
                print("Wrote", DEST)
                return
    raise SystemExit("ffmpeg.exe not found in archive")


if __name__ == "__main__":
    main()
