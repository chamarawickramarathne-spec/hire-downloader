"""Create simple icon.ico + logo.png for Hire Downloader."""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def make_logo(size: int = 512) -> Image.Image:
    img = Image.new("RGBA", (size, size), (17, 24, 39, 255))
    d = ImageDraw.Draw(img)
    m = size // 8
    # red rounded square
    d.rounded_rectangle((m, m, size - m, size - m), radius=size // 6, fill=(220, 38, 38, 255))
    # white download arrow
    cx, cy = size // 2, size // 2
    shaft_w = size // 10
    d.rectangle((cx - shaft_w // 2, cy - size // 5, cx + shaft_w // 2, cy + size // 12), fill=(255, 255, 255, 255))
    arrow = [
        (cx, cy + size // 4),
        (cx - size // 6, cy),
        (cx + size // 6, cy),
    ]
    d.polygon(arrow, fill=(255, 255, 255, 255))
    d.rectangle((cx - size // 5, cy + size // 4 + 4, cx + size // 5, cy + size // 4 + size // 16), fill=(255, 255, 255, 255))
    return img


def main() -> None:
    logo = make_logo(512)
    logo_path = os.path.join(ROOT, "logo.png")
    logo.save(logo_path)
    icos = [logo.resize(s, Image.Resampling.LANCZOS) for s in SIZES]
    ico_path = os.path.join(ROOT, "icon.ico")
    icos[0].save(ico_path, format="ICO", sizes=SIZES, append_images=icos[1:])
    print("Wrote", logo_path, ico_path)


if __name__ == "__main__":
    main()
