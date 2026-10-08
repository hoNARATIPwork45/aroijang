"""Swap the sung "ครัวคุณต๋อย" (song beats ~11-14.5) for the new "ครัวอิ่มจัง" line.

The backing under the phrase is replaced by the same backing 16 beats later
(beats 27-30.5, no vocal there), sample-aligned by cross-correlation and
crossfaded in; then music/voice_new.wav is mixed on top at the level the
original vocal had.  -> music/theme_patched.wav
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

sys.stdout.reconfigure(encoding='utf-8')
SR = 48000
P0, P1, LAG = 10.75, 14.75, 16     # patch region (song beats) and where the clean copy lives
XF = int(0.04 * SR)

_, x = wavfile.read('music/theme.wav')
x = x.astype(np.float64) / 32768.0
d = json.load(open('music/beats.json'))
k = np.arange(len(d['beats']))
b, a = np.polyfit(k, np.array(d['beats']), 1)
s0, s1 = int((a + b * P0) * SR), int((a + b * P1) * SR)
lag = int(round(LAG * b * SR))
A = x[s0:s1].mean(axis=1)
best = max(range(-960, 961, 4), key=lambda sh: float(np.dot(A, x[s0 + lag + sh:s1 + lag + sh].mean(axis=1))))
clean = x[s0 + lag + best:s1 + lag + best].copy()
print(f'patch {s0 / SR:.3f}-{s1 / SR:.3f}s from +{(lag + best) / SR:.3f}s (fine shift {best} samples)')

# vocal level in the original vs. its backing (vocal estimate = original - clean backing)
voc_rms = np.sqrt(np.mean((x[s0:s1] - clean) ** 2))
bed_rms = np.sqrt(np.mean(clean ** 2))
print(f'original vocal/backing ratio {20 * np.log10(voc_rms / bed_rms):+.1f} dB')

y = x.copy()
ramp = np.linspace(0, 1, XF)[:, None]
seg = clean.copy()
seg[:XF] = x[s0:s0 + XF] * (1 - ramp) + clean[:XF] * ramp
seg[-XF:] = clean[-XF:] * (1 - ramp) + x[s1 - XF:s1] * ramp
y[s0:s1] = seg

# new line: high-pass, gentle saturation, a little room, ~5 dB over the backing like a lead vocal
_, v = wavfile.read('music/voice_new.wav')
v = v.astype(np.float64) / 32768.0
v = sosfilt(butter(2, 140, btype='high', fs=SR, output='sos'), v)
v = v + 0.9 * sosfilt(butter(2, [2200, 5200], btype='band', fs=SR, output='sos'), v)  # presence: crisper consonants
v = np.tanh(1.6 * v) / np.tanh(1.6)
ir_n = int(0.35 * SR)
rng = np.random.default_rng(3)
ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR * 14)
ir[:int(0.008 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum())
wet = np.convolve(v, ir)
v = np.pad(v, (0, len(wet) - len(v))) + 0.18 * wet
v_rms = np.sqrt(np.mean(v[np.abs(v) > 0.02] ** 2))
w0, w1 = int((a + b * 11.0) * SR) - s0, int((a + b * 14.3) * SR) - s0
bed_phrase = np.sqrt(np.mean(clean[w0:w1] ** 2))
gain = bed_phrase * 10 ** (2.0 / 20) / v_rms   # clear but blended: ~+4 dB over the music in the vocal band
wavfile.write('music/_voice_processed.wav', SR, (v / np.abs(v).max() * 0.9 * 32767).astype(np.int16))
meta = json.load(open('music/voice_new.json'))
p = int(meta['start'] * SR)
# dip the backing ~3.5 dB under the line (smooth envelope), like a jingle voice-over
env = np.abs(v) > 0.02
env = np.convolve(env.astype(float), np.ones(int(0.12 * SR)) / int(0.12 * SR), 'same') > 0
duck = 1 - (1 - 10 ** (-3.5 / 20)) * np.convolve(env.astype(float), np.hanning(int(0.1 * SR)) / np.hanning(int(0.1 * SR)).sum(), 'same')
y[p:p + len(v)] *= duck[:, None]
_vb = sosfilt(butter(4, [300, 4000], btype='band', fs=SR, output='sos'), v * gain)
_mb = sosfilt(butter(4, [300, 4000], btype='band', fs=SR, output='sos'), y[p:p + len(v)].mean(axis=1))
_act = np.convolve((np.abs(v) > 0.05).astype(float), np.ones(2400) / 2400, 'same') > 0.5
print(f'vocal band while singing: voice {20 * np.log10(np.sqrt(np.mean(_vb[_act] ** 2))):.1f} dB, music {20 * np.log10(np.sqrt(np.mean(_mb[_act] ** 2))):.1f} dB')
y[p:p + len(v)] += (v * gain)[:, None] * np.array([[1.0, 1.0]])
peak = np.abs(y).max()
if peak > 0.98:
    y *= 0.98 / peak
wavfile.write('music/theme_patched.wav', SR, (y * 32767).astype(np.int16))
print(f'wrote music/theme_patched.wav (voice at {meta["start"]:.3f}s, gain {20 * np.log10(gain):+.1f} dB)')
