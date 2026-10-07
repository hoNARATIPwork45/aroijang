"""Capture the live website at phone size for the phone mockup in the video."""
from playwright.sync_api import sync_playwright

URL = 'https://honaratipwork45.github.io/aroijang/'

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3,
                        is_mobile=True, has_touch=True, locale='th-TH')
    pg = ctx.new_page()
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(2500)
    pg.screenshot(path='assets/site-home.png')
    # a second view a little further down (menu cards)
    pg.mouse.wheel(0, 520)
    pg.wait_for_timeout(1200)
    pg.screenshot(path='assets/site-menu.png')
    # the "ร้านใกล้ฉัน" map with the 500 m circle
    pg.mouse.wheel(0, -2000)
    pg.wait_for_timeout(600)
    pg.click('#btnMap')
    pg.wait_for_timeout(4000)
    pg.screenshot(path='assets/site-map.png')
    b.close()
print('ok')
