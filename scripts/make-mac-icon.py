#!/usr/bin/env python3
"""Build a macOS 26 Dock/Finder .icns from resources/icon.png.

Apple's macOS 26 (Tahoe) icon geometry for .icns / pre-Tahoe export:
- 1024×1024 canvas
- opaque squircle body is 824×824, inset 100px on every side
- corner radius 22.37% of the enclosure (iOS/macOS 26 template)
Full-bleed squares look too large next to native apps.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "resources" / "icon.png"
MASTER = ROOT / "resources" / "icon-macos.png"
ICNS = ROOT / "resources" / "icon.icns"

CANVAS = 1024
ENCLOSURE = 824  # 1024 - 100 - 100
INSET = (CANVAS - ENCLOSURE) // 2
RADIUS_RATIO = 0.2237
SUPERSAMPLE = 4

ICONSET_FILES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def squircle_mask(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    radius = int(round(big * RADIUS_RATIO))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def squirreled_art(src: Image.Image, size: int) -> Image.Image:
    art = src.convert("RGBA")
    if art.size != (size, size):
        art = art.resize((size, size), Image.Resampling.LANCZOS)
    mask = squircle_mask(size)
    art.putalpha(mask)
    return art


def drop_shadow(mask: Image.Image) -> Image.Image:
    """Soft contact shadow, allowed to sit in the 100px macOS margin."""
    pad = 48
    layer = Image.new("L", (ENCLOSURE + pad * 2, ENCLOSURE + pad * 2), 0)
    layer.paste(mask, (pad, pad + 6))
    layer = layer.filter(ImageFilter.GaussianBlur(22))
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    tint = Image.new("RGBA", layer.size, (0, 0, 0, 255))
    tint.putalpha(layer.point(lambda p: int(p * 0.38)))
    shadow.paste(tint, (INSET - pad, INSET - pad), tint)
    return shadow


def render_master() -> Image.Image:
    src = Image.open(SRC)
    body = squirreled_art(src, ENCLOSURE)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas = Image.alpha_composite(canvas, drop_shadow(body.getchannel("A")))
    canvas.paste(body, (INSET, INSET), body)
    return canvas


def write_iconset(master: Image.Image, folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for name, pixels in ICONSET_FILES.items():
        master.resize((pixels, pixels), Image.Resampling.LANCZOS).save(folder / name, "PNG")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing {SRC}")
    master = render_master()
    master.save(MASTER, "PNG")
    iconset = ROOT / "resources" / "AppIcon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    write_iconset(master, iconset)
    subprocess.run(["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(ICNS)], check=True)
    shutil.rmtree(iconset)
    print(f"Wrote {MASTER} (1024 canvas, 824 squircle, 100px macOS 26 inset)")
    print(f"Wrote {ICNS}")


if __name__ == "__main__":
    main()
