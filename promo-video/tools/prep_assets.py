"""Prepare textures for the promo video.

- Upscale the 313px mascot stickers (premultiplied Lanczos + mild unsharp),
  then wrap them in a white die-cut border with interior gaps filled.
- Same die-cut treatment for the logo.
- Copy the menu / shop photos used by the video.

Run from promo-video/:  python tools/prep_assets.py
"""
import os
import shutil

import cv2
import numpy as np

SRC = os.path.join('..', 'assets')
OUT = 'assets'
os.makedirs(OUT, exist_ok=True)


def imread(path):
    return cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_UNCHANGED)


def imwrite(path, im):
    ok, buf = cv2.imencode(os.path.splitext(path)[1], im)
    assert ok
    buf.tofile(path)


def upscale(bgra, s):
    f = bgra.astype(np.float32) / 255.0
    a = f[..., 3:4]
    prem = f[..., :3] * a
    h, w = bgra.shape[:2]
    size = (w * s, h * s)
    prem = cv2.resize(prem, size, interpolation=cv2.INTER_LANCZOS4)
    a = np.clip(cv2.resize(a, size, interpolation=cv2.INTER_LANCZOS4), 0, 1)[..., None]
    rgb = np.clip(prem / np.maximum(a, 1e-4), 0, 1)
    blur = cv2.GaussianBlur(rgb, (0, 0), s * 0.55)
    rgb = np.clip(rgb + 0.55 * (rgb - blur), 0, 1)
    # tighten the alpha ramp a little so the silhouette stays crisp
    a = np.clip((a - 0.5) * 1.6 + 0.5, 0, 1)
    return rgb, a


def fill_interior(mask):
    """Fill every region that is not reachable from the image border."""
    h, w = mask.shape
    ff = mask.copy()
    flood = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, flood, (0, 0), 255)
    return mask | cv2.bitwise_not(ff)


def die_cut(rgb, a, radius, pad, color=(1.0, 1.0, 1.0), close=0):
    rgb = cv2.copyMakeBorder(rgb, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    a = cv2.copyMakeBorder(a, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    if a.ndim == 2:
        a = a[..., None]
    m = (a[..., 0] > 0.3).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
    d = cv2.dilate(m, k)
    if close:
        kc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * close + 1, 2 * close + 1))
        d = cv2.morphologyEx(d, cv2.MORPH_CLOSE, kc)
    d = fill_interior(d)
    soft = cv2.GaussianBlur(d.astype(np.float32) / 255.0, (0, 0), max(1.0, radius * 0.18))
    border = np.clip((soft - 0.5) * 3.0 + 0.5, 0, 1)[..., None]
    col = np.array(color, np.float32)[None, None, :]
    out_rgb = rgb * a + col * (1 - a)
    out_a = np.maximum(border, a)
    out = np.concatenate([out_rgb, out_a], axis=2)
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def crop_to_alpha(bgra, margin=4):
    ys, xs = np.nonzero(bgra[..., 3] > 8)
    y0, y1 = max(ys.min() - margin, 0), min(ys.max() + margin + 1, bgra.shape[0])
    x0, x1 = max(xs.min() - margin, 0), min(xs.max() + margin + 1, bgra.shape[1])
    return bgra[y0:y1, x0:x1]


for name in ('mascot-peace', 'mascot-angry', 'mascot-hug'):
    src = imread(os.path.join(SRC, name + '.png'))
    rgb, a = upscale(src, 4)
    out = die_cut(rgb, a, radius=26, pad=40, close=18)
    out = crop_to_alpha(out)
    imwrite(os.path.join(OUT, name + '.png'), out)
    print(name, out.shape)

logo = imread(os.path.join(SRC, 'logo.png'))
rgb, a = upscale(logo, 2)
out = die_cut(rgb, a, radius=34, pad=50, close=40)
out = crop_to_alpha(out)
imwrite(os.path.join(OUT, 'logo-sticker.png'), out)
print('logo', out.shape)

for f in ['m01', 'm02', 'm05', 'm06', 'm08', 'm09', 'm13', 'm15', 'm16', 'm07', 'm12', 'm14']:
    shutil.copy(os.path.join(SRC, f + '.jpg'), os.path.join(OUT, f + '.jpg'))
for f in ['s-jetim', 's-padaeng', 's-maesri', 's-jenok', 's-moogrob', 's-toy', 's-khaokaeng', 's-obaun']:
    shutil.copy(os.path.join(SRC, f + '.jpg'), os.path.join(OUT, f + '.jpg'))
print('done')
