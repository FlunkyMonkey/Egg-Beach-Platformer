#!/usr/bin/env python3
"""Rebuild the game's art from the original photos of the drawings.

The drawings were photographed on a carpet, on spiral-bound paper. The first pass
at this (in Replit) cut the sprites out by deleting every pale pixel, which also
deleted the paper *inside* each outline — that is why the eggs were see-through,
Dawn was hollow, and the jellyfish lost her face.

Here each shape is found by selecting her marker strokes and filling the holes
they enclose, so paper inside an outline survives and the egg has a body.

Usage:  python3 scripts/extract_assets.py [--preview]
Writes: src/assets/*.png
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "attached_assets"
DST = ROOT / "src" / "assets"

# Which photo each piece of art comes from, and roughly where in the frame it sits
# as (left, top, right, bottom) fractions. The region only has to contain the art —
# it gets tightened to the actual ink afterwards.
PHOTOS = {
    "dawn": "IMG_4541_1776200154020.jpg",
    "egg": "IMG_4542_1776200148711.jpg",
    "jellyfish": "IMG_4543_1776200143312.jpg",
    "beach": "IMG_4544_1776200138161.jpg",
    "ocean": "IMG_4546_1776200131470.jpg",
    "forest": "IMG_4547_1776200120249.jpg",
    "volcano": "IMG_4549_1776200112119.jpg",
    "win": "IMG_4550_1776200097810.jpg",
    "title": "IMG_4551_1776200089550.jpg",
    # The crabs live on the sandbar of the ocean drawing.
    "crab": "IMG_4546_1776200131470.jpg",
    # For the intro: the title page kept as a photograph, paper edges and all,
    # plus the two notes she wrote in the margins.
    "intro_page": "IMG_4551_1776200089550.jpg",
    "note_dawn": "IMG_4541_1776200154020.jpg",
    "note_egg": "IMG_4542_1776200148711.jpg",
}

ROI = {
    # Each of these deliberately excludes her handwritten labels ("Egg", "Dawn",
    # "Donot Crach") — lovely on the page, unreadable at sprite size.
    "dawn": (0.05, 0.305, 0.78, 0.86),
    # Must include the whole outline: cropping through the base of the egg leaves
    # the ring open, and an open ring encloses nothing to fill.
    "egg": (0.03, 0.22, 0.87, 0.872),
    "jellyfish": (0.15, 0.18, 0.95, 0.90),
    # Backgrounds are cropped to the page exactly (no ink-tightening) so the
    # horizontal bands she painted — sky / sea / sand, canopy / trunks / floor —
    # stay intact. Those bands are what let the art tile sideways without a seam.
    "beach": (0.155, 0.075, 0.915, 0.915),
    "ocean": (0.355, 0.05, 0.885, 0.885),
    "forest": (0.325, 0.045, 0.915, 0.895),
    "volcano": (0.075, 0.28, 0.835, 0.92),
    "win": (0.33, 0.04, 0.88, 0.94),
    "title": (0.13, 0.03, 0.93, 0.97),
    # The sandbar strip holding her crabs, in the ocean drawing.
    "crab": (0.22, 0.62, 0.42, 0.80),
    # Deliberately looser than the title crop above — the intro wants the page to
    # look like a page, so the paper edge stays in.
    "intro_page": (0.09, 0.005, 0.975, 0.995),
    "note_dawn": (0.06, 0.838, 0.95, 0.995),
    "note_egg": (0.03, 0.772, 0.82, 0.945),
}


def load(name: str) -> Image.Image:
    im = Image.open(SRC / PHOTOS[name]).convert("RGB")
    return im


def roi_crop(im: Image.Image, key: str) -> Image.Image:
    l, t, r, b = ROI[key]
    W, H = im.size
    return im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))


def paper_stats(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (value, saturation) in 0..1 for an HxWx3 uint8 array."""
    f = a.astype(np.float32) / 255.0
    mx = f.max(-1)
    mn = f.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    return mx, sat


def white_balance(a: np.ndarray, paper: np.ndarray) -> np.ndarray:
    """Neutralise the warm indoor light using the paper as a white reference."""
    if paper.sum() < 50:
        return a
    ref = a[paper].reshape(-1, 3).mean(0)
    ref = np.maximum(ref, 1.0)
    gain = ref.mean() / ref
    out = a.astype(np.float32) * gain
    return np.clip(out, 0, 255).astype(np.uint8)


def punch(a: np.ndarray, sat_boost: float = 1.30, contrast: float = 1.12) -> np.ndarray:
    """Marker on paper photographs flat; give it back some life."""
    f = a.astype(np.float32)
    grey = f.mean(-1, keepdims=True)
    f = grey + (f - grey) * sat_boost
    f = 128.0 + (f - 128.0) * contrast
    return np.clip(f, 0, 255).astype(np.uint8)


def otsu(x: np.ndarray, bins: int = 256) -> float:
    """Threshold that best separates two groups of values.

    Used to split ink from paper. A percentile-of-brightness rule cannot do this:
    on Dawn's page the ink sits at 0.08 and the paper at 0.65, and the rule put the
    cut at 0.61 — right on top of the paper, so most of the page counted as ink and
    her cutout came out inside-out, with the black outline transparent and the paper
    opaque. That is what made the chicken look see-through in game. Otsu finds the
    empty valley between the two peaks instead of assuming where it is.
    """
    hist, edges = np.histogram(x, bins=bins, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 0.5
    centres = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist)
    w1 = total - w0
    valid = (w0 > 0) & (w1 > 0)
    if not valid.any():
        return 0.5
    csum = np.cumsum(hist * centres)
    m0 = np.divide(csum, w0, out=np.zeros_like(csum), where=w0 > 0)
    m1 = np.divide(csum[-1] - csum, w1, out=np.zeros_like(csum), where=w1 > 0)
    between = w0 * w1 * (m0 - m1) ** 2
    between[~valid] = -1
    return float(centres[int(np.argmax(between))])


def ink_mask(a: np.ndarray, s_thresh: float = 0.26, margin: float = 1.0) -> np.ndarray:
    """Ink = her marker strokes: much darker than the paper, or clearly coloured."""
    v, s = paper_stats(a)
    return (s > s_thresh) | (v < otsu(v) * margin)


def tighten_to_ink(im: Image.Image, pad_frac: float = 0.01) -> Image.Image:
    a = np.asarray(im)
    m = ink_mask(a)
    m = ndimage.binary_opening(m, np.ones((7, 7)))
    if not m.any():
        return im
    lab, n = ndimage.label(ndimage.binary_closing(m, np.ones((25, 25))))
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = lab == (int(np.argmax(sizes)) + 1)
    ys, xs = np.where(keep)
    pad = int(min(im.size) * pad_frac)
    x0 = max(0, xs.min() - pad); x1 = min(im.width, xs.max() + pad)
    y0 = max(0, ys.min() - pad); y1 = min(im.height, ys.max() + pad)
    return im.crop((x0, y0, x1, y1))


def cutout(im: Image.Image, feather: float = 1.2, close: int = 21, fill: bool = True) -> Image.Image:
    """Alpha = her marker strokes, plus whatever they enclose.

    Selecting the largest blob of ink and then filling its holes is what keeps the
    white *inside* an outline: the egg comes out with a body instead of being a
    ring. Thresholding pale pixels directly (the original approach) cannot do this,
    because the paper inside the outline is exactly as pale as the paper outside it.

    Photo lighting falls off unevenly across the page, so an absolute brightness
    cut leaves opaque rectangles of shadowed paper in the corners; working from the
    ink outward sidesteps that entirely.
    """
    a = np.asarray(im)
    ink = ink_mask(a)
    ink = ndimage.binary_opening(ink, np.ones((3, 3)))

    # Bridge the gaps where a marker line is thin or the pen lifted, so the shape
    # encloses properly and fill_holes has something to fill.
    if fill:
        # Pad with empty space first. She drew to the edge of the paper, so her
        # outline can run right up against the crop — and an interior that touches
        # the image border is not "enclosed", so fill_holes leaves it hollow. That
        # is what kept the egg a ring and the chicken a wireframe.
        pad = close + 4
        padded = np.pad(ink, pad, mode="constant", constant_values=False)

        joined = ndimage.binary_closing(padded, np.ones((close, close)))
        lab, n = ndimage.label(joined)
        if n == 0:
            return im.convert("RGBA")
        sizes = ndimage.sum(joined, lab, range(1, n + 1))
        subject = lab == (int(np.argmax(sizes)) + 1)
        subject = ndimage.binary_fill_holes(subject)
        # Undo the dilation the closing added, so edges sit on her actual strokes.
        subject = ndimage.binary_erosion(subject, np.ones((close // 2, close // 2)))
        subject = ndimage.binary_fill_holes(subject)
        subject = subject[pad:-pad, pad:-pad]
    else:
        # For a drawing that is already solid where it should be solid — the
        # jellyfish is a filled dome with loose trailing tentacles — keep the ink
        # itself. Filling holes here welds the tentacles into a paddle by making
        # the paper between them opaque.
        subject = ndimage.binary_closing(ink, np.ones((3, 3)))
        lab, n = ndimage.label(ndimage.binary_dilation(subject, np.ones((9, 9))))
        if n:
            sizes = ndimage.sum(subject, lab, range(1, n + 1))
            subject &= lab == (int(np.argmax(sizes)) + 1)
        subject = ndimage.binary_dilation(subject, np.ones((3, 3)))

    paper = ~ndimage.binary_dilation(subject, np.ones((9, 9)))
    rgb = white_balance(a, paper)
    rgb = punch(rgb)

    # Lift the white point so the paper inside the shape reads as paper. She drew
    # on white, but the photo records it as grey shading, and without this the egg
    # is a dirty pebble and Dawn is a grey hen. This is a smooth levels stretch
    # rather than a masked fill — masking the "paper-coloured" pixels leaves a
    # speckled edge wherever the shading crosses the threshold.
    v2, s2 = paper_stats(rgb)
    neutral = subject & (s2 < 0.22)
    if neutral.sum() > 40:
        level = float(np.percentile(v2[neutral], 70))
        rgb = np.clip(rgb.astype(np.float32) * (0.98 / max(level, 0.35)), 0, 255).astype(np.uint8)
        # Restore the bite in her outlines, which the stretch also brightened.
        f = rgb.astype(np.float32) / 255.0
        f = np.clip((f - 0.06) / 0.94, 0, 1) ** 1.12
        rgb = (f * 255).astype(np.uint8)

    out = Image.fromarray(rgb).convert("RGBA")
    alpha = Image.fromarray((subject * 255).astype(np.uint8))
    if feather:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    out.putalpha(alpha)
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def colour_cutout(im: Image.Image, hue: str, feather: float = 1.0) -> Image.Image:
    """Pull one coloured creature out of a busy drawing.

    Her crabs sit on a sandbar surrounded by sea and sand lines, so a bounding-box
    crop always drags scenery along with it. Selecting by marker colour and taking
    the biggest blob gets the creature alone.
    """
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if hue == "red":
        m = (r > 105) & (r - g > 42) & (r - b > 42)
    elif hue == "green":
        m = (g > 80) & (g - r > 22) & (g - b > 18)
    elif hue == "purple":
        m = (b > 70) & (b - g > 30) & (r - g > 12)
    else:
        raise ValueError(hue)

    m = ndimage.binary_opening(m, np.ones((7, 7)))
    m = ndimage.binary_closing(m, np.ones((15, 15)))
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit(f"no {hue} creature found")
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    subject = lab == (int(np.argmax(sizes)) + 1)
    subject = ndimage.binary_fill_holes(subject)
    subject = ndimage.binary_dilation(subject, np.ones((5, 5)))

    rgb = punch(np.asarray(im), sat_boost=1.25, contrast=1.10)
    out = Image.fromarray(rgb).convert("RGBA")
    alpha = Image.fromarray((subject * 255).astype(np.uint8))
    if feather:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    out.putalpha(alpha)
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def make_h_seamless(im: Image.Image, blend: float = 0.14) -> Image.Image:
    """Make a background tile end where it begins, horizontally.

    The levels scroll further than one page of her artwork, so the background has
    to repeat. Butting two copies together shows a hard vertical seam wherever the
    page edges differ in brightness. Cross-fading the left edge over the strip that
    would have followed it makes the repeat continuous, so the beach just carries
    on. Only the horizontal axis matters — the art never tiles vertically.
    """
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    b = max(1, int(w * blend))
    ramp = np.linspace(0.0, 1.0, b, dtype=np.float32)[None, :, None]
    merged = a[:, w - b:] * (1.0 - ramp) + a[:, :b] * ramp
    out = a[:, : w - b].copy()
    out[:, :b] = merged
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def fade_h_edges(im: Image.Image, fade: float = 0.16) -> Image.Image:
    """Ramp the left and right edges to transparent.

    Only used for a background that is drawn as a spaced landmark rather than a
    continuous tile. Without it her volcano ends on a hard vertical line where the
    page stops, which reads as a torn edge floating over the terrain.
    """
    im = im.convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    w = a.shape[1]
    b = max(1, int(w * fade))
    ramp = np.linspace(0.0, 1.0, b, dtype=np.float32)
    alpha = np.ones(w, dtype=np.float32)
    alpha[:b] = ramp
    alpha[-b:] = ramp[::-1]
    a[..., 3] *= alpha[None, :]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def flatten(im: Image.Image) -> Image.Image:
    """Background art: keep it opaque, just clean and punch the colour."""
    a = np.asarray(im)
    v, s = paper_stats(a)
    paper = (v > float(np.percentile(v, 70))) & (s < 0.16)
    rgb = white_balance(a, paper)
    rgb = punch(rgb, sat_boost=1.35, contrast=1.10)
    return Image.fromarray(rgb)


def fit(im: Image.Image, w: int, h: int | None = None) -> Image.Image:
    if h is None:
        h = round(im.height * (w / im.width))
    return im.resize((w, h), Image.LANCZOS)


# name: (roi key, output width, closing radius, fill enclosed areas)
#
# The closing radius bridges gaps in her strokes before the holes get filled, and
# it has to suit the drawing. The egg is one big outline that must seal shut, so it
# needs a wide bridge; the jellyfish has thin separated tentacles, and a wide bridge
# there welds them into a web and fills the gaps between with opaque paper.
SPRITES = {
    "egg_sprite": ("egg", 150, 23, True),
    "dawn_sprite": ("dawn", 300, 15, True),
}

# Creatures picked out of the ocean drawing's sandbar by marker colour.
CREATURES = {
    "crab_sprite": ("crab", "red", 200),
    "crab_green_sprite": ("crab", "green", 190),
    # The jellyfish comes out by colour too. Selecting her purple avoids the pale
    # rectangle of shadowed paper that brightness thresholding left behind the
    # tentacles, and filling the enclosed areas keeps her drawn-on face.
    "jellyfish_sprite": ("jellyfish", "purple", 260),
}

BACKGROUNDS = {
    "bg_beach": ("beach", 1200),
    "bg_ocean": ("ocean", 1200),
    "bg_forest": ("forest", 1200),
    "bg_volcano": ("volcano", 1200),
    "title_art": ("title", 900),
    "win_screen": ("win", 900),
    "intro_page": ("intro_page", 1000),
    "note_dawn": ("note_dawn", 900),
    "note_egg": ("note_egg", 800),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true", help="write to /tmp instead")
    args = ap.parse_args()

    dst = Path("/private/tmp/claude-501/-Users-claude-agent/a50a209d-9123-46f7-991f-63a357027389/scratchpad/preview") if args.preview else DST
    dst.mkdir(parents=True, exist_ok=True)

    for out_name, (key, width, close, fill) in SPRITES.items():
        im = roi_crop(load(key), key)
        im = cutout(tighten_to_ink(im, pad_frac=0.02), close=close, fill=fill)
        im = fit(im, width)
        im.save(dst / f"{out_name}.png")
        print(f"  {out_name:20s} {im.size[0]}x{im.size[1]}  (alpha cutout)")

    for out_name, (key, hue, width) in CREATURES.items():
        im = colour_cutout(roi_crop(load(key), key), hue)
        im = fit(im, width)
        im.save(dst / f"{out_name}.png")
        print(f"  {out_name:20s} {im.size[0]}x{im.size[1]}  ({hue} creature)")

    for out_name, (key, width) in BACKGROUNDS.items():
        im = roi_crop(load(key), key)
        im = flatten(im)  # exact page crop; see the ROI note above
        if out_name == "bg_volcano":
            im = fade_h_edges(im)
        elif out_name.startswith("bg_"):
            im = make_h_seamless(im)
        im = fit(im, width)
        im.save(dst / f"{out_name}.png")
        print(f"  {out_name:20s} {im.size[0]}x{im.size[1]}")

    print(f"\nwrote to {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
