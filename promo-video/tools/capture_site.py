"""Capture the live website at phone size for the phone mockup in the video.

The banner is held on its first slide (reduced motion) and Math.random is
seeded so the "ร้านใกล้ฉัน" list can be retried until the top shops are open.
"""
import re
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
URL = 'https://honaratipwork45.github.io/aroijang/'
SEED_JS = """(() => { let s = %d >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();"""


def page_for(b, seed):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True,
                        has_touch=True, locale='th-TH', reduced_motion='reduce')
    ctx.add_init_script(SEED_JS % seed)
    pg = ctx.new_page()
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(1500)
    return ctx, pg


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx, pg = page_for(b, 1)
    pg.screenshot(path='assets/site-home.png')
    pg.mouse.wheel(0, 520)
    pg.wait_for_timeout(1000)
    pg.screenshot(path='assets/site-menu.png')
    ctx.close()
    for seed in range(1, 40):
        ctx, pg = page_for(b, seed)
        pg.click('#btnMap')
        pg.wait_for_timeout(4000)
        status = re.findall(r'(เปิดอยู่|ปิดแล้ว) ·', pg.evaluate('document.body.innerText'))
        if status[:2] == ['เปิดอยู่', 'เปิดอยู่']:
            pg.screenshot(path='assets/site-map.png')
            print('map seed', seed, status[:4])
            ctx.close()
            break
        ctx.close()
    b.close()
print('ok')
