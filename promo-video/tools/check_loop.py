"""Check the rendered MP4: stream info, and whether the last->first frame step
looks like any other frame step (i.e. the loop seam is invisible)."""
import subprocess
import sys

import cv2
import imageio_ffmpeg
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
path = sys.argv[1] if len(sys.argv) > 1 else 'out/aroijang-promo-30s.mp4'
ff = imageio_ffmpeg.get_ffmpeg_exe()
info = subprocess.run([ff, '-hide_banner', '-i', path], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
print('\n'.join(l for l in info.splitlines() if 'Duration' in l or 'Stream' in l))

cap = cv2.VideoCapture(path)
frames = []
while True:
    ok, f = cap.read()
    if not ok:
        break
    frames.append(cv2.resize(f, (480, 270), interpolation=cv2.INTER_AREA).astype(np.int16))
n = len(frames)
d = np.array([np.abs(frames[i + 1] - frames[i]).mean() for i in range(n - 1)])
seam = np.abs(frames[0] - frames[-1]).mean()
print(f'frames {n}  step mean {d.mean():.2f}  median {np.median(d):.2f}  p95 {np.percentile(d, 95):.2f}  max {d.max():.2f}')
print(f'seam (last->first) {seam:.2f}  -> percentile among steps: {(d < seam).mean() * 100:.0f}%')
strip = np.hstack([frames[i].astype(np.uint8) for i in (n - 3, n - 2, n - 1, 0, 1, 2)])
cv2.imwrite('out/seam_strip.jpg', strip)
print('wrote out/seam_strip.jpg (last 3 | first 3)')
