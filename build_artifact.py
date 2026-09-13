import base64, re, pathlib, mimetypes
html = pathlib.Path('index.html').read_text(encoding='utf-8')
for f in sorted(pathlib.Path('assets').iterdir()):
    if not f.is_file():
        continue
    ref = 'assets/' + f.name
    if ref not in html:
        continue
    mime = mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
    html = html.replace(ref, 'data:%s;base64,%s' % (mime, base64.b64encode(f.read_bytes()).decode()))
html = re.sub(r'^.*?<title>', '<title>', html, flags=re.S)
html = html.replace('</head>', '', 1).replace('<body>', '', 1)
html = html.replace('</body>', '', 1).replace('</html>', '', 1)
html = html.replace('<title>อร่อยจัง · ตังเกือบครบ</title>', '<title>อิ่มจัง</title>', 1)
html = re.sub(r'^\s+', '', html)
pathlib.Path('อิ่มจัง.artifact.html').write_text(html, encoding='utf-8')
print('artifact bytes:', len(html))
