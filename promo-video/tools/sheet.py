"""Tile stills into contact sheets for quick review: python tools/sheet.py [cols] [width]"""
import glob
import os
import sys

import cv2
import numpy as np

cols = int(sys.argv[1]) if len(sys.argv) > 1 else 2
tw = int(sys.argv[2]) if len(sys.argv) > 2 else 960
files = sorted(glob.glob(os.path.join('out', 'stills', '*.png')))
th = tw * 9 // 16
tiles = []
for f in files:
    im = cv2.imdecode(np.fromfile(f, np.uint8), cv2.IMREAD_COLOR)
    im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
    label = os.path.basename(f)[:-4]
    cv2.putText(im, label, (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 5)
    cv2.putText(im, label, (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    tiles.append(im)
per = cols * 2
for s in range(0, len(tiles), per):
    group = tiles[s:s + per]
    while len(group) % cols:
        group.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(group[i:i + cols]) for i in range(0, len(group), cols)]
    out = os.path.join('out', f'sheet_{s // per:02d}.jpg')
    cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(out)
