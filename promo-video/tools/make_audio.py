"""Synthesize the 30 s seamless-loop soundtrack (128 BPM, 16 bars, G major)
plus sound effects placed from out/cues.json (written by render.py --cues).

Everything is mixed into a circular buffer, so tails at the end wrap into the
start and the file loops without a click.     python tools/make_audio.py
"""
import json
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
BEAT = 22500                     # 60/128 s at 48 kHz (exact)
N = BEAT * 64                    # 30 s
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'out')
rng = np.random.default_rng(7)


def t_of(n):
    return np.arange(n) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def band(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def noise(n):
    return rng.standard_normal(n)


def pan2(x, pan=0.0):
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2)


class Bus:
    def __init__(self):
        self.b = np.zeros((N, 2))

    def add(self, sig, start, gain=1.0, pan=0.0):
        s2 = pan2(sig, pan) if sig.ndim == 1 else sig
        s2 = s2 * gain
        s = int(round(start)) % N
        n = len(s2)
        while n > 0:
            k = min(n, N - s)
            self.b[s:s + k] += s2[:k]
            s2 = s2[k:]
            n -= k
            s = 0


def sweep_bp(x, f0, f1, q=2.0):
    """Band-pass with exponentially moving centre (state-variable filter)."""
    n = len(x)
    f = f0 * (f1 / f0) ** np.linspace(0, 1, n)
    g = 2 * np.sin(np.pi * np.minimum(f, SR * 0.24) / SR)
    damp = 1.0 / q
    low = band_ = 0.0
    y = np.empty(n)
    for i in range(n):
        high = x[i] - low - damp * band_
        band_ += g[i] * high
        low += g[i] * band_
        y[i] = band_
    return y


# ------------------------------------------------------------------ drums
def kick():
    t = t_of(int(SR * 0.42))
    f = 48 + 120 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.0)
    click = noise(len(t)) * np.exp(-t * 500) * 0.25
    return np.tanh(1.8 * (s + click)) * 0.95


def clap():
    t = t_of(int(SR * 0.32))
    env = np.zeros_like(t)
    for off in (0.0, 0.008, 0.017, 0.027):
        m = t >= off
        env[m] += np.exp(-(t[m] - off) * 160)
    env += np.where(t > 0.027, np.exp(-(t - 0.027) * 15) * 0.55, 0)
    return band(noise(len(t)), 900, 4200) * env * 1.6


def snare():
    t = t_of(int(SR * 0.2))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35)
    nz = band(noise(len(t)), 1200, 7000) * np.exp(-t * 24)
    return (tone * 0.6 + nz * 1.1)


def hat(open_=False):
    t = t_of(int(SR * (0.28 if open_ else 0.06)))
    return hp(noise(len(t)), 7500, 3) * np.exp(-t * (11 if open_ else 70)) * 0.9


def shaker():
    t = t_of(int(SR * 0.07))
    env = (1 - np.exp(-t * 300)) * np.exp(-t * 55)
    return band(noise(len(t)), 5000, 11000) * env


# ------------------------------------------------------------------ tones
def pluck(m, dur=0.22, bright=1.0, harm=14, detune=0.0):
    f = mtof(m)
    t = t_of(int(SR * dur))
    out = np.zeros_like(t)
    for k in range(1, harm + 1):
        if f * k > 14000:
            break
        a = (1.0 / k) * np.exp(-t * (4 + k * 2.6 / bright))
        out += a * np.sin(2 * np.pi * f * k * t * (1 + detune))
    att = np.minimum(1, t / 0.003)
    rel = np.minimum(1, (dur - t) / 0.02)
    return out * att * rel


def bass(m, dur=0.2):
    s = pluck(m, dur, bright=0.55, harm=12)
    sub = np.sin(2 * np.pi * mtof(m) * t_of(len(s))) * np.minimum(1, (dur - t_of(len(s))) / 0.02)
    return np.tanh(1.4 * (s * 0.8 + sub * 0.7))


def marimba(m, dur=0.6):
    f = mtof(m)
    t = t_of(int(SR * dur))
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5.5)
         + 0.3 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 16)
         + 0.1 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 38)
         + 0.22 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4.0))
    s *= np.minimum(1, t / 0.002)
    return s


def bell(m, dur=1.0):
    f = mtof(m)
    t = t_of(int(SR * dur))
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 3.2)
            + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)
            + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 10)) * np.minimum(1, t / 0.002)


# ------------------------------------------------------------------ sfx
def mixs(*parts):
    n = max(len(p) for p in parts)
    return sum(np.pad(p, (0, n - len(p))) for p in parts)


def chirp(f0, f1, dur, decay):
    t = t_of(int(SR * dur))
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * decay) * np.minimum(1, t / 0.002)


def sfx_pop(hi=False):
    return chirp(520 * (1.6 if hi else 1), 1500 * (1.6 if hi else 1), 0.09, 30) * 0.9


def sfx_drop():
    return mixs(chirp(1500, 380, 0.13, 18) * 0.7, chirp(200, 90, 0.12, 30) * 0.6)


def sfx_whoosh(dur=0.45, f0=350, f1=3600):
    n = int(SR * dur)
    t = t_of(n)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return sweep_bp(noise(n), f0, f1, 1.8) * env * 2.2


def sfx_slam():
    t = t_of(int(SR * 0.9))
    f = 42 + 80 * np.exp(-t * 14)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.5)
    nz = lp(noise(len(t)), 1800) * np.exp(-t * 22) * 0.8
    return np.tanh(2.0 * (boom + nz)) * 0.9


def sfx_crash():
    t = t_of(int(SR * 2.6))
    nz = hp(noise(len(t)), 3500, 2) * np.exp(-t * 2.1)
    metal = sum(np.sin(2 * np.pi * f * t + rng.random() * 6) for f in (3120, 4370, 5230, 6650, 7810)) * 0.08 * np.exp(-t * 3)
    return (nz + metal) * np.minimum(1, t / 0.004) * 0.75


def sfx_confetti():
    t = t_of(int(SR * 0.7))
    burst = band(noise(len(t)), 800, 6000) * np.exp(-t * 60) * 1.2
    crackle = np.zeros_like(t)
    for _ in range(40):
        p = int(rng.random() * len(t) * 0.85)
        ln = 120
        crackle[p:p + ln] += noise(ln) * np.exp(-np.arange(ln) / 25) * (0.25 + rng.random() * 0.3) * (1 - p / len(t))
    return burst + hp(crackle, 3000)


def sfx_boing():
    t = t_of(int(SR * 0.6))
    f = 210 + 160 * (1 - np.exp(-t * 7)) + 40 * np.sin(2 * np.pi * 13 * t) * np.exp(-t * 5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5) * 0.8


def sfx_ding():
    return mixs(bell(91, 1.3) * 0.5, bell(98, 1.0) * 0.25)


def sfx_stamp():
    t = t_of(int(SR * 0.25))
    return np.sin(2 * np.pi * 105 * t) * np.exp(-t * 20) * 0.9 + band(noise(len(t)), 300, 2500) * np.exp(-t * 45) * 0.7


def sfx_ching(k=1.0):
    t = t_of(int(SR * 0.5))
    s = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * d) for f, a, d in ((2850, 1, 9), (4310, 0.6, 13), (5720, 0.4, 18), (7400, 0.2, 25)))
    return (s + hp(noise(len(t)), 6000) * np.exp(-t * 90) * 0.4) * 0.45


def sfx_coins():
    out = np.zeros(int(SR * 1.2))
    for i in range(12):
        c = sfx_ching(0.85 + rng.random() * 0.45) * (1 - i / 14)
        p = int((i * 0.06 + rng.random() * 0.04) * SR)
        out[p:p + len(c)] += c[:len(out) - p]
    return out


def sfx_tap():
    t = t_of(int(SR * 0.06))
    return np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 110) * 0.6 + band(noise(len(t)), 2000, 8000) * np.exp(-t * 300) * 0.4


def sfx_cascade():
    out = np.zeros(int(SR * 1.0))
    notes = [67, 69, 71, 74, 76, 79, 81, 83, 86, 88]
    for i, m in enumerate(notes):
        p = chirp(mtof(m), mtof(m) * 1.5, 0.08, 34) * 0.55
        o = int(i * 0.055 * SR)
        out[o:o + len(p)] += p
    return out


def sfx_riser(beats):
    dur = beats * BEAT / SR
    n = int(beats * BEAT)
    t = t_of(n)
    k = t / dur
    nz = sweep_bp(noise(n), 300, 7000, 1.4) * (k ** 2) * 1.6
    f = 180 * (6 ** k)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (k ** 2.5) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * (4 + 18 * k) * t))
    return nz + tone


def sfx_ping():
    t = t_of(int(SR * 1.4))
    s = np.sin(2 * np.pi * 1320 * t) * np.exp(-t * 4.5) * 0.5 + np.sin(2 * np.pi * 2640 * t) * np.exp(-t * 9) * 0.15
    echo = np.zeros_like(s)
    d = int(SR * 0.21)
    echo[d:] += s[:-d] * 0.35
    echo[2 * d:] += s[:-2 * d] * 0.15
    return (s + echo) * np.minimum(1, t / 0.003)


SFX = {
    'pop': lambda: sfx_pop(False), 'pop2': lambda: sfx_pop(True), 'drop': sfx_drop,
    'whoosh': sfx_whoosh, 'swish': lambda: sfx_whoosh(0.26, 900, 5000), 'flip': lambda: sfx_whoosh(0.16, 1200, 6000),
    'slam': sfx_slam, 'crash': sfx_crash, 'confetti': sfx_confetti, 'boing': sfx_boing, 'ding': sfx_ding,
    'stamp': sfx_stamp, 'ching': sfx_ching, 'coins': sfx_coins, 'tap': sfx_tap, 'cascade': sfx_cascade,
    'thud': lambda: sfx_slam() * 0.4, 'ping': sfx_ping,
}
RISERS = {'riser': 4.0, 'riser2': 2.0}


# ------------------------------------------------------------------ music
CHORDS = ['G', 'D', 'Em', 'C'] * 3 + ['G', 'D', 'C', 'D']
BASS_ROOT = {'G': 43, 'D': 38, 'Em': 40, 'C': 36}
VOICING = {'G': [55, 59, 62, 67], 'D': [54, 57, 62, 66], 'Em': [55, 59, 64, 67], 'C': [55, 60, 64, 67]}
ARP = {'G': [67, 71, 74, 79], 'D': [66, 69, 74, 78], 'Em': [64, 67, 71, 76], 'C': [64, 67, 72, 76]}
# melody on an 8th grid: (midi, length in 8ths) or None
MEL = {
    'G': [(79, 1), None, (74, 1), None, (71, 1), (74, 1), None, (79, 1)],
    'D': [(78, 2), None, (76, 1), (74, 1), None, (69, 2), None, None],
    'Em': [(76, 1), None, (71, 1), None, (67, 1), (71, 1), None, (76, 1)],
    'C': [(74, 1), None, (76, 1), None, (79, 2), None, (76, 1), None],
}
MEL_C2 = [(76, 1), (74, 1), (72, 1), None, (74, 1), None, (76, 2), None]
LEAD_BARS = {0, 1, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14}
ARP_BARS = {2, 3, 15}
BREAK_BAR = 9
BUILD_BAR = 15


def build_music(drums, music, kicks):
    K, C, S, Hc, Ho, Sh = kick(), clap(), snare(), hat(False), hat(True), shaker()
    E = BEAT // 2
    for bar in range(16):
        b0 = bar * 4 * BEAT
        ch = CHORDS[bar]
        for beat in range(4):
            gb = bar * 4 + beat
            st = b0 + beat * BEAT
            kick_on = True
            if bar == BREAK_BAR and beat > 0:
                kick_on = False
            if bar == BUILD_BAR and beat >= 2:
                kick_on = False
            if kick_on:
                drums.add(K, st, 1.0)
                kicks.append(st)
            if beat in (1, 3) and bar != BUILD_BAR:
                drums.add(C, st, 0.55, 0.05)
            if bar != BUILD_BAR:
                drums.add(Hc, st + E, 0.32 if bar != BREAK_BAR else 0.2, 0.25)
                if beat == 3 and bar != BREAK_BAR:
                    drums.add(Ho, st + E, 0.22, -0.2)
            if bar != BUILD_BAR:
                for q in range(4):
                    drums.add(Sh, st + q * BEAT // 4, 0.09 if q % 2 else 0.05, -0.35)
            del gb
        # snare rolls
        if bar == BREAK_BAR:
            for i in range(16):
                drums.add(S, b0 + 2 * BEAT + i * BEAT // 8, 0.12 + 0.35 * i / 15, 0.1)
        if bar == BUILD_BAR:
            for i in range(8):
                drums.add(S, b0 + i * BEAT // 4, 0.15 + 0.1 * i / 8, 0.1)
            for i in range(14):
                drums.add(S, b0 + 2 * BEAT + i * BEAT // 8, 0.25 + 0.4 * i / 13, -0.1)
        # bass: octave bounce on 8ths (rests in the build's last beats)
        r = BASS_ROOT[ch]
        for i in range(8):
            if bar == BUILD_BAR and i >= 6:
                continue
            if bar == BREAK_BAR and i >= 2:
                continue
            m = r + (12 if i % 2 else 0)
            music['bass'].add(bass(m, 0.19), b0 + i * E, 0.5)
        # chord stabs on off-beats
        if bar != BREAK_BAR:
            for beat in range(4):
                if bar == BUILD_BAR and beat >= 3:
                    continue
                for j, m in enumerate(VOICING[ch]):
                    music['keys'].add(pluck(m, 0.2, bright=1.3, harm=16, detune=0.003 * (j - 1.5)), b0 + beat * BEAT + E, 0.13, -0.3 + 0.2 * j)
        else:
            for j, m in enumerate(VOICING[ch]):  # held pad-ish chord in the breakdown
                music['keys'].add(pluck(m, 1.8, bright=0.45, harm=10), b0, 0.4, -0.3 + 0.2 * j)
                music['keys'].add(pluck(m + 12, 0.9, bright=0.6, harm=6), b0 + 2 * BEAT, 0.22, 0.3 - 0.2 * j)
        # lead / arps
        if bar in LEAD_BARS:
            mel = MEL_C2 if (bar == 14) else MEL[ch]
            for i, n in enumerate(mel):
                if n:
                    m, ln = n
                    music['lead'].add(marimba(m, 0.25 + ln * 0.2), b0 + i * E, 0.42, 0.15)
                    music['lead'].add(bell(m + 12, 0.5) * 0.12, b0 + i * E, 0.4, -0.15)
        if bar in ARP_BARS:
            notes = ARP[ch]
            for i in range(16):
                m = notes[i % 4] + (12 if (bar == BUILD_BAR and i >= 8) else 0)
                g = 0.12 if bar != BUILD_BAR else 0.08 + 0.1 * i / 15
                music['lead'].add(pluck(m, 0.16, bright=1.6, harm=10), b0 + i * BEAT // 4, g, 0.3 if i % 2 else -0.3)


def sidechain(kicks):
    g = np.ones(N)
    t = t_of(int(SR * 0.4))
    duck = 1 - 0.5 * np.exp(-t * 11)
    for k in kicks:
        s = k % N
        n = min(len(duck), N - s)
        g[s:s + n] = np.minimum(g[s:s + n], duck[:n])
        if n < len(duck):
            g[:len(duck) - n] = np.minimum(g[:len(duck) - n], duck[n:])
    return g[:, None]


def reverb_ir(sec=1.6):
    n = int(SR * sec)
    t = t_of(n)
    ir = np.stack([lp(noise(n), 6000), lp(noise(n), 6000)], axis=1) * np.exp(-t * 4.2)[:, None]
    ir[: int(SR * 0.012)] = 0
    return ir / np.sqrt((ir ** 2).sum(axis=0).mean())


def circ_conv(x, ir):
    X = np.fft.rfft(x, axis=0)
    H = np.fft.rfft(np.pad(ir, ((0, N - len(ir)), (0, 0))), axis=0)
    return np.fft.irfft(X * H, n=N, axis=0)


def main():
    with open(os.path.join(OUT, 'cues.json'), encoding='utf-8') as f:
        cues = json.load(f)
    drums = Bus()
    music = {'bass': Bus(), 'keys': Bus(), 'lead': Bus()}
    sfx = Bus()
    kicks = []
    build_music(drums, music, kicks)
    for c in cues:
        typ = c['type']
        start = c['beat'] * BEAT
        if typ in RISERS:
            sfx.add(sfx_riser(RISERS[typ]), start, 0.55 * c['gain'], c['pan'])
        elif typ in SFX:
            sfx.add(SFX[typ](), start, 0.6 * c['gain'], c['pan'])
    duck = sidechain(kicks)
    mus = music['bass'].b * 0.9 + music['keys'].b * 0.9 + music['lead'].b
    mus = mus * duck
    ir = reverb_ir()
    wet = circ_conv(music['keys'].b * 0.6 + music['lead'].b * 0.8 + sfx.b * 0.25, ir) * 0.16
    mix = drums.b * 0.85 + mus * 0.9 + sfx.b * 0.95 + wet
    peak = np.abs(mix).max()
    mix = mix / peak * 1.25
    mix = np.tanh(mix) / np.tanh(1.25) * 0.89
    rms = np.sqrt((mix ** 2).mean())
    print(f'peak {np.abs(mix).max():.3f}  rms {20 * np.log10(rms):.1f} dBFS  cues {len(cues)}')
    wavfile.write(os.path.join(OUT, 'soundtrack.wav'), SR, (mix * 32767).astype(np.int16))
    print('wrote out/soundtrack.wav', N / SR, 's')


if __name__ == '__main__':
    main()
