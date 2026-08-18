"""Hire Downloader v3.0 — pywebview + Edge WebView2."""
from __future__ import annotations

import os
import sys


def main() -> int:
    import webview

    from backend.app import Api
    from backend.config import bundle_dir

    api = Api()

    frontend = os.path.join(bundle_dir(), "frontend", "index.html")
    window = webview.create_window(
        "Hire Downloader",
        url=frontend,
        js_api=api,
        width=1000,
        height=700,
        min_size=(800, 560),
        resizable=True,
        text_select=False,
    )
    api.set_window(window)

    webview.start(debug="--debug" in sys.argv)
    api.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
