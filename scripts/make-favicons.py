# /// script
# dependencies = ["pillow", "numpy", "potracer", "resvg-py"]
# ///
"""Build the site favicon set from the logo, with no hand-drawing.

    uv run scripts/make-favicons.py

There is no logo SVG in this repo — the logo exists only as
docs/assets/img/jp-logo.png (cream on transparent; trap #19). So the
monogram is TRACED from that PNG's alpha channel (potrace — mechanical,
not redrawn) and the letterforms are checked against the source: the
script prints how closely the vector matches the original mask and fails
if it drifts. Every output PNG is rendered FROM the SVG, so the SVG and
the fallbacks cannot disagree.

Why a separate mark, not the logo scaled down: at 16 px the "PATCHES"
wordmark is mush and drags the whole icon down, so the favicon is the
monogram alone — cream on an OPAQUE dark square (cream on transparent
vanishes against a light tab bar), width filling the square with minimal
padding.

Outputs, in docs/assets/img/: favicon.svg, favicon-16/32/48/192.png and
apple-touch-icon.png (180).
"""
from io import BytesIO
from pathlib import Path

import numpy as np
import potrace
import resvg_py
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "docs" / "assets" / "img"
SRC = IMG / "jp-logo.png"

BG = "#0a0a0a"          # the app's own background token (design-system.md)
PAD = 0.03              # fraction of the square left empty on each side
SIZES = {"favicon-16.png": 16, "favicon-32.png": 32, "favicon-48.png": 48,
         "favicon-192.png": 192, "apple-touch-icon.png": 180}
MIN_IOU = 0.985         # vector vs source mask; below this the trace drifted

# ── 1. isolate the monogram (everything above the gap before "PATCHES") ──
rgba = np.array(Image.open(SRC).convert("RGBA"))
alpha = rgba[:, :, 3]
ink_rows = (alpha > 127).any(axis=1)
h = alpha.shape[0]
best_start = best_len = 0
run_start = None
for y in range(h // 4, h * 9 // 10):
    if not ink_rows[y]:
        run_start = y if run_start is None else run_start
    elif run_start is not None:
        if y - run_start > best_len:
            best_start, best_len = run_start, y - run_start
        run_start = None
gap_mid = best_start + best_len // 2
mono = alpha[:gap_mid] > 127
ys, xs = np.where(mono)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
mono = mono[y0:y1, x0:x1]
H, W = mono.shape

# The logo's own cream, sampled from solid (fully opaque) glyph pixels.
solid = rgba[:gap_mid][(alpha[:gap_mid] > 250)]
cream = "#%02x%02x%02x" % tuple(int(v) for v in np.median(solid[:, :3], axis=0))

# ── 2. trace it ──────────────────────────────────────────────────────────
bm = potrace.Bitmap(~mono)   # potracer traces the False pixels; ink is True
plist = bm.trace(turdsize=2, alphamax=1.0, opticurve=True, opttolerance=0.2)
parts = []
for curve in plist:
    s = curve.start_point
    parts.append(f"M{s.x:.2f},{s.y:.2f}")
    for seg in curve.segments:
        if seg.is_corner:
            parts.append(f"L{seg.c.x:.2f},{seg.c.y:.2f}L{seg.end_point.x:.2f},{seg.end_point.y:.2f}")
        else:
            parts.append(f"C{seg.c1.x:.2f},{seg.c1.y:.2f} {seg.c2.x:.2f},{seg.c2.y:.2f} "
                         f"{seg.end_point.x:.2f},{seg.end_point.y:.2f}")
    parts.append("Z")
path_d = "".join(parts)


def svg_for(px: int) -> str:
    """The favicon at a 64-unit viewBox: glyph fills the width less PAD."""
    avail = 64 * (1 - 2 * PAD)
    scale = avail / W
    gh = H * scale
    tx, ty = 64 * PAD, (64 - gh) / 2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{px}" height="{px}">'
        f'<rect width="64" height="64" fill="{BG}"/>'
        f'<path fill="{cream}" fill-rule="evenodd" '
        f'transform="translate({tx:.3f} {ty:.3f}) scale({scale:.5f})" d="{path_d}"/></svg>'
    )


def render(svg: str, px: int) -> Image.Image:
    data = resvg_py.svg_to_bytes(svg_string=svg, width=px, height=px)
    return Image.open(BytesIO(bytes(data))).convert("RGB")


# ── 3. prove the trace matches the source letterforms ────────────────────
check_svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
    f'<rect width="{W}" height="{H}" fill="#000"/>'
    f'<path fill="#fff" fill-rule="evenodd" d="{path_d}"/></svg>')
check = Image.open(BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=check_svg, width=W, height=H)))).convert("L")
vec = np.array(check) > 127
inter = np.logical_and(vec, mono).sum()
union = np.logical_or(vec, mono).sum()
iou = inter / union
print(f"monogram {W}x{H}px from {SRC.name}; cream {cream}; "
      f"{len(plist)} traced shapes; vector-vs-source IoU {iou:.4f}")
assert iou >= MIN_IOU, f"trace drifted from the source letterforms (IoU {iou:.4f})"

# ── 4. write everything ──────────────────────────────────────────────────
(IMG / "favicon.svg").write_text(svg_for(64) + "\n")
for name, px in SIZES.items():
    render(svg_for(px), px).save(IMG / name, optimize=True)
    print(f"  wrote {name} ({px}x{px})")
print("  wrote favicon.svg")
