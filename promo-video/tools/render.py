"""Render the promo with headless Chrome (GPU) and encode it with ffmpeg.

  python tools/render.py --stills 0,3.2,10       # PNG stills into out/stills/
  python tools/render.py --cues                  # write out/cues.json (sound cue sheet)
  python tools/render.py --video --fps 60        # full 30 s MP4 (+ out/soundtrack.wav if present)
"""
import argparse
import functools
import http.server
import json
import os
import subprocess
import sys
import threading
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'out')
DUR = 30.0


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
        '.wav': 'audio/wav', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg',
    }

    def log_message(self, *a):
        pass


def serve():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def open_page(p, port):
    b = p.chromium.launch(channel='chrome', headless=True,
                          args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1920, 'height': 1080})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR {e}'))
    t0 = time.time()
    pg.goto(f'http://127.0.0.1:{port}/index.html?render=1')
    pg.wait_for_function('window.READY || window.INIT_ERROR', timeout=300000)
    err = pg.evaluate('window.INIT_ERROR || null')
    if err:
        print(err)
        print('\n'.join(logs))
        sys.exit(1)
    print(f'page ready in {time.time() - t0:.1f}s')
    for line in logs:
        if 'error' in line.lower() or 'warn' in line.lower():
            print(line)
    return b, pg, logs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', default='')
    ap.add_argument('--tag', default='')
    ap.add_argument('--cues', action='store_true')
    ap.add_argument('--video', action='store_true')
    ap.add_argument('--fps', type=int, default=60)
    ap.add_argument('--start', type=float, default=0.0)
    ap.add_argument('--dur', type=float, default=DUR)
    ap.add_argument('--name', default='aroijang-promo-30s')
    ap.add_argument('--png', action='store_true')
    ap.add_argument('--crf', type=int, default=18)
    ap.add_argument('--frames', action='store_true')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    srv = serve()
    port = srv.server_address[1]
    with sync_playwright() as p:
        b, pg, logs = open_page(p, port)
        clip = {'x': 0, 'y': 0, 'width': 1920, 'height': 1080}
        if a.cues or a.video:
            cues = pg.evaluate('window.SFX_CUES')
            with open(os.path.join(OUT, 'cues.json'), 'w', encoding='utf-8') as f:
                json.dump(cues, f, indent=1)
            print('cues:', len(cues))
        if a.stills:
            d = os.path.join(OUT, 'stills')
            os.makedirs(d, exist_ok=True)
            for s in a.stills.split(','):
                t = float(s)
                pg.evaluate(f'renderAt({t})')
                path = os.path.join(d, f'{a.tag}t{t:06.2f}.png')
                pg.screenshot(path=path, clip=clip)
                print('still', path)
        if a.video:
            n = int(round(a.dur * a.fps))
            wav = os.path.join(OUT, 'soundtrack.wav')
            mp4 = os.path.join(OUT, a.name + '.mp4')
            cmd = [ffmpeg_exe(), '-y', '-loglevel', 'error',
                   '-f', 'image2pipe', '-framerate', str(a.fps),
                   '-c:v', 'png' if a.png else 'mjpeg', '-i', '-']
            has_audio = os.path.exists(wav) and a.start == 0 and abs(a.dur - DUR) < 1e-6
            if has_audio:
                cmd += ['-i', wav]
            conv = ('scale=out_range=tv:out_color_matrix=bt709' if a.png else
                    'scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709')
            cmd += ['-vf', conv + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(a.crf),
                    '-profile:v', 'high', '-r', str(a.fps), '-colorspace', 'bt709', '-color_primaries', 'bt709',
                    '-color_trc', 'bt709', '-color_range', 'tv']
            if has_audio:
                cmd += ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', f'{a.dur:.3f}']
            cmd += ['-movflags', '+faststart', mp4]
            ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            t0 = time.time()
            for i in range(n):
                t = a.start + i / a.fps
                pg.evaluate(f'renderAt({t:.6f})')
                if a.png:
                    img = pg.screenshot(type='png', clip=clip)
                else:
                    img = pg.screenshot(type='jpeg', quality=96, clip=clip)
                ff.stdin.write(img)
                if i % 60 == 0:
                    el = time.time() - t0
                    print(f'frame {i}/{n}  {el:.0f}s  eta {el / max(i, 1) * (n - i):.0f}s', flush=True)
            ff.stdin.close()
            ff.wait()
            print('video', mp4, f'{time.time() - t0:.0f}s', 'audio' if has_audio else 'no audio')
        if a.frames:
            # resumable: PNG frames on disk (existing ones are skipped), encoded at the end
            n = int(round(DUR * a.fps))
            d = os.path.join(OUT, f'frames{a.fps}')
            os.makedirs(d, exist_ok=True)
            t0 = time.time()
            todo = [i for i in range(n) if not os.path.exists(os.path.join(d, f'{i:05d}.png'))]
            print(f'{n - len(todo)} frames already on disk, {len(todo)} to render', flush=True)
            for k, i in enumerate(todo):
                pg.evaluate(f'renderAt({i / a.fps:.6f})')
                img = pg.screenshot(type='png', clip=clip)
                path = os.path.join(d, f'{i:05d}.png')
                with open(path + '.tmp', 'wb') as f:
                    f.write(img)
                os.replace(path + '.tmp', path)
                if k % 60 == 0:
                    el = time.time() - t0
                    print(f'frame {i}/{n}  {el:.0f}s  eta {el / max(k, 1) * (len(todo) - k):.0f}s', flush=True)
        b.close()
    srv.shutdown()
    if a.frames:
        d = os.path.join(OUT, f'frames{a.fps}')
        mp4 = os.path.join(OUT, a.name + '.mp4')
        tmp = os.path.join(OUT, a.name + '.part.mp4')
        cmd = [ffmpeg_exe(), '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', os.path.join(d, '%05d.png'),
               '-i', os.path.join(OUT, 'soundtrack.wav'),
               '-vf', 'scale=out_range=tv:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow',
               '-crf', str(a.crf), '-profile:v', 'high', '-r', str(a.fps), '-colorspace', 'bt709',
               '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
               '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', f'{DUR:.3f}', '-movflags', '+faststart', tmp]
        subprocess.run(cmd, check=True)
        os.replace(tmp, mp4)
        print('video', mp4, flush=True)


if __name__ == '__main__':
    main()
