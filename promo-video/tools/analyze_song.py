"""Estimate tempo + beat grid of music/theme.wav and draw a structure map.

Onset envelope = positive spectral flux on a log-frequency spectrogram;
tempo = autocorrelation peak (with a mild prior around 120 BPM);
beats = dynamic-programming tracker (Ellis 2007).
"""
import json
import sys

import cv2
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

sys.stdout.reconfigure(encoding='utf-8')
path = sys.argv[1] if len(sys.argv) > 1 else 'music/theme.wav'
sr, x = wavfile.read(path)
x = x.astype(np.float32) / 32768.0
mono = x.mean(axis=1) if x.ndim == 2 else x
HOP = 480  # 10 ms at 48 kHz
f, t, Z = stft(mono, sr, nperseg=2048, noverlap=2048 - HOP)
mag = np.abs(Z)
# log-frequency bands 40 Hz .. 12 kHz
edges = np.geomspace(40, 12000, 65)
bands = np.stack([mag[(f >= lo) & (f < hi)].sum(axis=0) for lo, hi in zip(edges[:-1], edges[1:])])
logb = np.log1p(100 * bands)
flux = np.maximum(0, np.diff(logb, axis=1)).sum(axis=0)
flux = np.concatenate([[0], flux])
env = flux - np.convolve(flux, np.ones(40) / 40, mode='same')  # remove slow trend
env = np.maximum(env, 0)
env /= env.max() + 1e-9
fps = sr / HOP

# tempo by autocorrelation
ac = np.correlate(env - env.mean(), env - env.mean(), mode='full')[len(env) - 1:]
bpms = np.arange(60, 200, 0.25)
lags = 60 * fps / bpms
score = np.interp(lags, np.arange(len(ac)), ac)
prior = np.exp(-0.5 * (np.log2(bpms / 120) / 0.9) ** 2)
best = bpms[np.argmax(score * prior)]
top = sorted(zip(score * prior, bpms), reverse=True)[:6]
print('tempo candidates:', [(round(b, 2), round(float(s / max(score)), 3)) for s, b in top])

# beat tracking (DP)
P = 60 * fps / best
alpha = 100.0
n = len(env)
cum = env.copy()
back = -np.ones(n, dtype=int)
for i in range(n):
    lo, hi = int(i - 2 * P), int(i - P / 2)
    if hi <= 0:
        continue
    lo = max(lo, 0)
    prev = np.arange(lo, hi)
    pen = -alpha * (np.log((i - prev) / P)) ** 2
    cand = cum[prev] + pen
    j = np.argmax(cand)
    cum[i] = env[i] + cand[j]
    back[i] = prev[j]
i = int(np.argmax(cum[-int(P * 2):])) + n - int(P * 2)
beats = []
while i >= 0:
    beats.append(i)
    i = back[i]
beats = np.array(beats[::-1]) / fps
ibi = np.diff(beats)
print(f'best {best:.2f} BPM  beats {len(beats)}  median ibi {np.median(ibi):.4f}s -> {60 / np.median(ibi):.2f} BPM')
print('first beats', np.round(beats[:8], 3).tolist())
json.dump({'bpm': float(best), 'beats': beats.tolist(), 'dur': len(mono) / sr}, open('music/beats.json', 'w'))

# structure map: spectrogram + onset env + beat ticks (every 4th beat bold)
S = 20 * np.log10(mag + 1e-6)
fr = np.geomspace(40, 16000, 260)
img = S[np.searchsorted(f, fr)]
img = np.clip((img + 80) / 75, 0, 1)
W = 2000
img = cv2.resize((img[::-1] * 255).astype(np.uint8), (W, 260), interpolation=cv2.INTER_AREA)
img = cv2.applyColorMap(img, cv2.COLORMAP_MAGMA)
dur = len(mono) / sr
for k, b in enumerate(beats):
    xx = int(b / dur * W)
    cv2.line(img, (xx, 0), (xx, 259), (255, 255, 255) if k % 4 == 0 else (90, 90, 90), 1)
    if k % 4 == 0:
        cv2.putText(img, str(k), (xx + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
e = np.zeros((90, W, 3), np.uint8)
xs = np.linspace(0, len(env) - 1, W).astype(int)
for i2, xi in enumerate(xs):
    h = int(env[xi] * 88)
    e[89 - h:, i2] = (100, 220, 120)
for s in range(0, int(dur) + 1, 5):
    xx = int(s / dur * W)
    cv2.putText(e, f'{s}s', (xx + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
cv2.imwrite('music/structure.png', np.vstack([img, e]))
print('wrote music/structure.png')
