"""Pick the 64-beat stretch of music/theme.wav that loops best.

Prints tempo stability (beat residuals vs a straight grid) and, for each
candidate start beat s, how similar the music right after beat s+64 is to the
music at beat s (harmony + loudness) — high = the loop seam will be smooth.
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

sys.stdout.reconfigure(encoding='utf-8')
sr, x = wavfile.read('music/theme.wav')
x = x.astype(np.float32) / 32768.0
mono = x.mean(axis=1)
d = json.load(open('music/beats.json'))
beats = np.array(d['beats'])
k = np.arange(len(beats))
A = np.vstack([k, np.ones_like(k)]).T
(b, a), *_ = np.linalg.lstsq(A, beats, rcond=None)
res = beats - (a + b * k)
print(f'grid: beat {b:.5f}s ({60 / b:.3f} BPM), offset {a:.3f}s, residual max {np.abs(res).max() * 1000:.0f} ms, rms {np.sqrt((res ** 2).mean()) * 1000:.0f} ms')

HOP = 480
f, t, Z = stft(mono, sr, nperseg=4096, noverlap=4096 - HOP)
mag = np.abs(Z)
valid = (f > 60) & (f < 5000)
pc = np.round(12 * np.log2(f[valid] / 440.0)) % 12
chroma_frames = np.stack([mag[valid][pc == p].sum(axis=0) for p in range(12)])
rms_frames = np.sqrt((mag ** 2).sum(axis=0))
fps = sr / HOP


def beat_feat(i):
    lo, hi = int(beats[i] * fps), int(beats[i + 1] * fps) if i + 1 < len(beats) else int((beats[i] + b) * fps)
    c = chroma_frames[:, lo:hi].mean(axis=1)
    c = c / (np.linalg.norm(c) + 1e-9)
    return c, rms_frames[lo:hi].mean()


feats = [beat_feat(i) for i in range(len(beats))]
energy = np.array([e for _, e in feats])
print('beat energy (x100, normalized):')
en = energy / energy.max()
for row in range(0, len(beats), 16):
    print(f'  {row:3d}: ' + ' '.join(f'{int(v * 9)}' for v in en[row:row + 16]))
print('candidates: start s, seam similarity (beats s+64..s+65 vs s..s+1, and s+63 vs s-1)')
for s in range(0, len(beats) - 65):
    sim_after = np.mean([feats[s + 64 + j][0] @ feats[s + j][0] for j in range(0, 2)])
    sim_before = feats[s + 63][0] @ feats[s - 1][0] if s >= 1 else float('nan')
    print(f'  s={s:2d}  t={beats[s]:6.2f}s -> end {beats[s + 64]:6.2f}s   after {sim_after:.3f}   before {sim_before:.3f}')
