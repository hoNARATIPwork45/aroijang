"""Turn music/theme.wav into a 30.000 s seamless loop on the film's 128 BPM grid.

Takes 64 beats starting at beat START (plus one beat of pre/post roll), time-
stretches them with ffmpeg's rubberband so 64 beats = 30 s exactly, puts that
first beat on t = 0 and crossfades the tail into the pre-roll so the wrap from
the last sample to the first is continuous.  -> music/song_loop.wav
"""
import json
import subprocess
import sys

import imageio_ffmpeg
import numpy as np
from scipy.io import wavfile

sys.stdout.reconfigure(encoding='utf-8')
START = int(sys.argv[1]) if len(sys.argv) > 1 else 4
SRC = sys.argv[2] if len(sys.argv) > 2 else 'music/theme.wav'
SR = 48000
N = 1440000                 # 30 s
BEAT_OUT = 22500            # 60/128 s
XF = BEAT_OUT // 4          # seam crossfade (a 16th note)

d = json.load(open('music/beats.json'))
beats = np.array(d['beats'])
k = np.arange(len(beats))
b, a = np.polyfit(k, beats, 1)       # steady grid: beat length b, offset a
t0 = a + b * (START - 1)             # one beat of pre-roll
t1 = a + b * (START + 65)            # one beat of post-roll
ratio = (64 * b) / 30.0              # >1: speed up
print(f'source beat {b:.5f}s ({60 / b:.2f} BPM) -> 128 BPM, tempo x{ratio:.5f}; segment {t0:.3f}-{t1:.3f}s')

ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{t0:.4f}', '-to', f'{t1:.4f}',
                '-i', SRC,
                '-af', f'rubberband=tempo={ratio:.6f}:transients=crisp:detector=compound:window=standard:channels=together',
                '-ar', str(SR), '-ac', '2', 'music/_stretched.wav'], check=True)
sr, y = wavfile.read('music/_stretched.wav')
y = y.astype(np.float64) / 32768.0
pre = BEAT_OUT                         # start beat lands one output beat in
assert len(y) >= pre + N, (len(y), pre + N)
loop = y[pre:pre + N].copy()
# equal-power crossfade: the tail slides into the pre-roll that precedes beat START
w = np.linspace(0, np.pi / 2, XF)[:, None]
loop[N - XF:] = loop[N - XF:] * np.cos(w) + y[pre - XF:pre] * np.sin(w)
peak = np.abs(loop).max()
loop = loop / peak * 0.9
wavfile.write('music/song_loop.wav', SR, (loop * 32767).astype(np.int16))
print(f'wrote music/song_loop.wav  {len(loop) / SR:.3f}s  seam step {abs(loop[0] - loop[-1]).max():.4f}')

# verify: onset envelope of the loop should peak on the 128 BPM grid
m = loop.mean(axis=1)
hop = 480
frames = len(m) // hop
e = np.array([np.abs(m[i * hop:(i + 1) * hop]).sum() for i in range(frames)])
on = np.maximum(0, np.diff(np.log1p(100 * e), prepend=0))
grid = np.arange(64) * BEAT_OUT / hop
best = max(range(-6, 7), key=lambda s: sum(on[int(round(g + s)) % frames] for g in grid))
print(f'grid alignment offset: {best * 10} ms (0 = beats exactly on the film grid)')
