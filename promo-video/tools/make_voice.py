"""Make the replacement line "ครัวอิ่มจัง" for the theme song.

edge-tts (th-TH-PremwadeeNeural) speaks the phrase; each syllable is cut at
the word boundaries, time-stretched to the rhythm the original singer used
("ครัว-คุณ-ต๋อย" at song beats ~11.0 / 12.2 / 12.8, held to ~14.3), and the
whole line is pitch-shifted to the singer's range (~318 Hz).
-> music/voice_new.wav (mono, 48 kHz) + music/voice_new.json (start time in the song)
"""
import asyncio
import json
import subprocess
import sys

import edge_tts
import imageio_ffmpeg
import numpy as np
from scipy.io import wavfile

sys.stdout.reconfigure(encoding='utf-8')
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
VOICE = 'th-TH-PremwadeeNeural'
WORDS = ['ครัว', 'อิ่ม', 'จัง']
TARGET = [(11.0, 11.85), (12.0, 12.6), (12.75, 14.2)]   # song beats (start, end) per syllable
TARGET_F0 = None  # keep the TTS's own pitch: any pitch shifting blurred the words


async def tts(text, path, rate='-35%', pitch='+40Hz', tries=5):
    for attempt in range(tries):  # the free service drops requests now and then
        try:
            c = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, boundary='WordBoundary')
            marks = []
            with open(path, 'wb') as f:
                async for ch in c.stream():
                    if ch['type'] == 'audio':
                        f.write(ch['data'])
                    elif ch['type'] == 'WordBoundary':
                        marks.append((ch['offset'] / 1e7, (ch['offset'] + ch['duration']) / 1e7, ch['text']))
            return marks
        except edge_tts.exceptions.NoAudioReceived:
            await asyncio.sleep(2 + 2 * attempt)
    raise RuntimeError('edge-tts returned no audio')


def decode(src, dst):
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ac', '1', '-ar', str(SR), dst], check=True)
    _, y = wavfile.read(dst)
    return y.astype(np.float64) / 32768.0


def stretch(seg, ratio_out_over_in, semis=0.0):
    """time-stretch (and optionally pitch-shift) one syllable with rubberband."""
    wavfile.write('music/_seg.wav', SR, (seg * 32767).astype(np.int16))
    tempo = 1.0 / ratio_out_over_in
    pitch = 2 ** (semis / 12)
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', 'music/_seg.wav', '-af',
                    f'rubberband=tempo={tempo:.5f}:pitch={pitch:.5f}:transients=crisp:formant=preserved:window=standard',
                    '-ar', str(SR), 'music/_seg_out.wav'], check=True)
    _, y = wavfile.read('music/_seg_out.wav')
    return y.astype(np.float64) / 32768.0


def median_f0(y):
    fr, hop, f0 = int(0.04 * SR), int(0.01 * SR), []
    for i in range(0, len(y) - fr, hop):
        w = y[i:i + fr] * np.hanning(fr)
        if np.sqrt((w ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(w, w, 'full')[fr - 1:]
        lo, hi = int(SR / 500), int(SR / 80)
        lag = lo + np.argmax(ac[lo:hi])
        if ac[lag] > 0.5 * ac[0]:
            f0.append(SR / lag)
    return float(np.median(f0)) if f0 else 0.0


def main():
    marks = asyncio.run(tts('ครัว อิ่ม จัง', 'music/_tts.mp3'))
    y = decode('music/_tts.mp3', 'music/_tts.wav')
    print('word marks:', marks)
    f0 = median_f0(y)
    semis = 12 * np.log2(TARGET_F0 / f0) if TARGET_F0 else 0.0
    print(f'tts median F0 {f0:.0f} Hz -> shift {semis:+.2f} semitones')
    d = json.load(open('music/beats.json'))
    k = np.arange(len(d['beats']))
    b, a = np.polyfit(k, np.array(d['beats']), 1)
    words = [m for m in marks if m[2].strip()]
    assert len(words) == 3, words
    # the service's word offsets run early; re-anchor them on the first audible onset
    env = np.sqrt(np.convolve(y ** 2, np.ones(240) / 240, 'same'))
    shift = np.argmax(env > 0.1 * env.max()) / SR - words[0][0]
    words = [(s + shift, e + shift, w) for s, e, w in words]
    # one smooth pass (no cutting between syllables keeps the speech intelligible):
    # stretch the whole line so "ครัว" starts on the first target beat and "จัง" ends on the last
    pre = 0.02
    on, end = words[0][0], min(len(y) / SR, words[2][1] + 0.15)
    seg = y[int((on - pre) * SR):int(end * SR)]
    want = (TARGET[-1][1] - TARGET[0][0]) * b + pre
    ratio = want / (len(seg) / SR)
    out = stretch(seg, ratio, semis)
    fade = int(0.012 * SR)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade * 4:] *= np.linspace(1, 0, fade * 4)
    t_start = a + b * TARGET[0][0] - pre
    print('stretch x%.2f; syllables start on song beats' % ratio,
          [round(TARGET[0][0] + (w[0] - on) * ratio / b, 2) for w in words])
    out /= np.abs(out).max()
    wavfile.write('music/voice_new.wav', SR, (out * 0.9 * 32767).astype(np.int16))
    json.dump({'start': t_start, 'beat': TARGET[0][0]}, open('music/voice_new.json', 'w'))
    print(f'wrote music/voice_new.wav ({len(out) / SR:.2f}s) placed at {t_start:.3f}s in the song; final F0 {median_f0(out * 0.9):.0f} Hz')


if __name__ == '__main__':
    main()
