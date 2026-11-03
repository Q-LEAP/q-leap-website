"""Redirect pages for addresses the static site links to but does not have: WordPress redirections
(/testing/ → /testing-service/…), pages disabled in the migration inventory (tools/inventory, with
their chosen target) and WordPress archives that were not migrated (categories, tags, portfolio
domains), sent to the closest page. Each page is a small HTML file (noindex, canonical,
meta refresh) since GitHub Pages has no server-side redirects.
Usage: python3 tools/export/redirects.py   (rules: tools/export/redirects.json)"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = 'https://q-leap.eu'
PAGE = """<!doctype html>
<html lang="{lang}" data-redirect>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, follow">
<title>Redirection</title>
<link rel="canonical" href="{site}/{target}">
<meta http-equiv="refresh" content="0; url={relative}">
<script>location.replace('{relative}' + location.hash)</script>
</head>
<body><p><a href="{relative}">{site}/{target}</a></p></body>
</html>
"""


def linked_paths():
    """Internal addresses linked from the site's pages."""
    files = subprocess.run(['git', 'ls-files', '-z', '-co', '--exclude-standard', '*.html'], cwd=ROOT, capture_output=True, text=True).stdout.split('\0')
    found = set()
    for file in files:
        if not file or file.startswith(('tools/', 'docs/')):
            continue
        markup = open(os.path.join(ROOT, file), errors='ignore').read()
        for href in re.findall(r'<a\s[^>]*?href="([^"#?]+)', markup):
            if not re.match(r'(https?:|mailto:|tel:|javascript:|/)', href):
                path = os.path.normpath(os.path.join(os.path.dirname(file), href))
                if not path.startswith('..'):
                    found.add(path)
    return found


def write(path, target):
    folder = os.path.join(ROOT, path)
    file = os.path.join(folder, 'index.html')
    if os.path.exists(file) and 'data-redirect' not in open(file).read(300):
        return False  # a real page: never replaced
    relative = '../' * (path.count('/') + 1) + target
    os.makedirs(folder, exist_ok=True)
    open(file, 'w').write(PAGE.format(lang='en' if path.startswith('en/') else 'fr', site=SITE, target=target, relative=relative))
    return True


if __name__ == '__main__':
    rules = json.load(open(os.path.join(ROOT, 'tools', 'export', 'redirects.json')))
    written = 0
    pages = dict(rules['pages'])
    for item in json.load(open(os.path.join(ROOT, 'tools', 'inventory', 'inventory.json'))):
        path = item['url'].replace(SITE + '/', '').strip('/')
        if item['decision'] != 'Garder' and item.get('redirect') and path:
            pages.setdefault(path, item['redirect'])
    for path, target in pages.items():
        written += write(path, target)
    for path in sorted(linked_paths()):
        if os.path.exists(os.path.join(ROOT, path, 'index.html')) or os.path.isfile(os.path.join(ROOT, path)):
            continue
        for prefix, target in rules['prefixes'].items():
            if path.startswith(prefix):
                written += write(path, target)
                break
    print(written, 'redirections')
