"""Fetch aria2c.exe for the current platform."""
from __future__ import annotations

import os
import platform
import urllib.request
import zipfile
import io
import sys


def main():
    is_64 = platform.machine().endswith("64") or platform.architecture()[0] == "64bit"
    arch = "win-64" if is_64 else "win-32"
    version = "1.37.0"
    url = f"https://github.com/aria2/aria2/releases/download/release-{version}/aria2-{version}-{arch}.zip"

    resources = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resources")
    os.makedirs(resources, exist_ok=True)
    dest = os.path.join(resources, "aria2c.exe")

    if os.path.isfile(dest) and os.path.getsize(dest) > 100_000:
        print(f"aria2c.exe already exists ({os.path.getsize(dest)} bytes)")
        return

    print(f"Downloading aria2c {version} ({arch})...")
    print(f"  URL: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "HireDownloader/3.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()

    print("Extracting...")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            if name.endswith("aria2c.exe"):
                with zf.open(name) as src, open(dest, "wb") as dst:
                    dst.write(src.read())
                break

    if os.path.isfile(dest):
        print(f"Saved: {dest} ({os.path.getsize(dest)} bytes)")
    else:
        print("ERROR: aria2c.exe not found in zip")
        sys.exit(1)


if __name__ == "__main__":
    main()
