#!/usr/bin/env python3
"""Build the M0 atlas and review sheet from editable JSON; Python 3 stdlib only."""
import argparse
import colorsys
import html
import json
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art/palettes/shorelands.json"
ATLAS = ROOT / "unity/Assets/Isoperia/Art/Textures/shorelands_atlas.png"
PREVIEW = ROOT / "art/palettes/shorelands_review.svg"


def ramp(hsv, t):
    """Keep the tuned hue; shade with value and soften saturation in sunlight."""
    h, s, v = hsv
    if t <= 0.5:
        f = t * 2
        s *= 0.9 + 0.1 * f
        v *= 0.55 + 0.45 * f
    else:
        f = (t - 0.5) * 2
        s *= 1 - 0.35 * f
        v += (min(1, v * 1.3) - v) * f
    return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h / 360, s, v))


def chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def stored_deflate(data):
    """Canonical zlib stream: fixed stored blocks, independent of compressor build."""
    stream = bytearray(b"\x78\x01")
    blocks = [data[i:i + 65535] for i in range(0, len(data), 65535)] or [b""]
    for i, block in enumerate(blocks):
        size = len(block)
        stream.append(int(i == len(blocks) - 1))  # BFINAL, BTYPE=00, byte padding
        stream.extend(struct.pack("<HH", size, size ^ 0xFFFF))
        stream.extend(block)
    stream.extend(struct.pack(">I", zlib.adler32(data) & 0xFFFFFFFF))
    return bytes(stream)


def build():
    data = json.loads(SOURCE.read_text())
    bands, width, stride = data["bands"], data["width"], data["band_height"]
    if data["layout_version"] != 1 or width != 256 or stride != 32 or len(bands) != 5:
        raise ValueError("Layout v1 is five 32px bands in a 256x160 atlas; migrate UVs for layout changes")
    if [b["id"] for b in bands] != ["sand", "timber", "grass", "sea", "slate"]:
        raise ValueError("Band IDs/order are an authored UV contract")
    for band in bands:
        h, s, v = band["tuned_hsv"]
        if not (0 <= h < 360 and 0 <= s <= 1 and 0 <= v <= 1):
            raise ValueError("HSV outside supported range")
    height = stride * len(bands)
    # PNG is top-down; Unity UV v=0 is bottom. Sand is always the bottom band.
    pixels = [bytes(c for x in range(width) for c in ramp(b["tuned_hsv"], x / (width - 1)))
              for b in bands]
    raw = b"".join((b"\0" + row) * stride for row in reversed(pixels))
    # Explicit block boundaries avoid drift between zlib implementations. Level
    # zero compression alone does not specify how a compressor splits blocks.
    # The tiny RGB asset
    # stays below 121 KiB; import is deliberately uncompressed with no mipmaps.
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"sRGB", b"\0") + chunk(b"IDAT", stored_deflate(raw)) + chunk(b"IEND", b""))
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="960" height="660" viewBox="0 0 960 660">',
           '<rect width="960" height="660" fill="#18212b"/>',
           '<g font-family="sans-serif" fill="#f3eee2">',
           '<text x="40" y="52" font-size="28">ALDERFELL / SHORELANDS</text>',
           '<text x="40" y="82" font-size="16">M0 palette study · five hue families · lit-scene review pending</text>']
    for i, band in enumerate(bands):
        y = 120 + i * 92
        stops = ''.join(f'<stop offset="{x / 32:.5f}" stop-color="#{bytes(ramp(band["tuned_hsv"], x / 32)).hex()}"/>' for x in range(33))
        svg.extend([f'<defs><linearGradient id="b{i}">{stops}</linearGradient></defs>',
                    f'<text x="40" y="{y}" font-size="18">{html.escape(band["role"])}</text>',
                    f'<rect x="40" y="{y + 12}" width="640" height="42" rx="5" fill="url(#b{i})"/>',
                    f'<text x="712" y="{y + 39}" font-size="17">UV v = {(i + .5) / 5:.1f}</text>'])
    svg.extend(['<text x="40" y="608" font-size="15">Shadow → body colour → sunlit edge. Source: Kenney Fantasy Town Kit 2.0 (CC0).</text>',
                '<text x="40" y="632" font-size="15">Palette reference only; this is not a Shorelands scene or phone-quality proof.</text>', '</g></svg>'])
    return {ATLAS: png, PREVIEW: ('\n'.join(svg) + '\n').encode()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail on stale/missing outputs; never write")
    args = parser.parse_args()
    outputs = build()
    for path, payload in outputs.items():
        if args.check:
            if not path.exists() or path.read_bytes() != payload:
                raise SystemExit(f"Stale output: {path.relative_to(ROOT)}; run tools/build_shorelands_palette.py")
        else:
            path.write_bytes(payload)
        print(f'{"Checked" if args.check else "Wrote"} {path.relative_to(ROOT)} ({len(payload)} bytes)')


if __name__ == "__main__":
    main()
