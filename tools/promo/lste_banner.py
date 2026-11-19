"""LSTE banner: the "LSTE 2026" bar at the top of every page, as the WordPress site showed it
(WPCode snippet "Q-Leap – Bandeau LSTE 2026", sources in tools/wordpress/).

Added to the published copy only, at deploy time (deploy.yml, before tools/perf/optimize.py, so
the banner's stylesheet is bundled like the others), so the pages in the repository stay as
exported and the banner goes away by itself: after END the script adds nothing. main.js hides a
banner still in a cached page after END and wires the close button (closed for the current page
only, no cookie or storage).

Texts: lste-banner-texts.json (fr / en, chosen from <html lang>). Markup: lste-banner.html.
Usage: python3 tools/promo/lste_banner.py --root _site"""
import argparse
import datetime
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
END = datetime.datetime(2026, 11, 26, 20, 0, tzinfo=datetime.timezone.utc)  # matches main.js
STYLESHEET = 'assets/css/lste-promo.css'


def banners():
    template = open(os.path.join(HERE, 'lste-banner.html'), encoding='utf-8').read()
    logo = open(os.path.join(HERE, 'lste-logo-paths.txt'), encoding='utf-8').read().strip()
    texts = json.load(open(os.path.join(HERE, 'lste-banner-texts.json'), encoding='utf-8'))
    result = {}
    for lang, values in texts.items():
        markup = template.replace('{{logo}}', logo)
        for key, value in values.items():
            markup = markup.replace('{{' + key + '}}', value)
        result[lang] = markup
    return result


def add_banner(file, root, markup):
    page = open(file, encoding='utf-8').read()
    if 'class="lste-promo"' in page or 'data-redirect' in page[:300] or 'data-blog-redirect' in page[:300]:
        return False
    body = re.search(r'<body\b[^>]*>', page)
    head_end = page.find('</head>')
    if not body or head_end < 0:
        return False
    lang = 'en' if re.search(r'<html[^>]*\blang="en', page[:500]) else 'fr'
    prefix = os.path.relpath(root, os.path.dirname(file)).replace(os.sep, '/')
    link = f'<link rel="stylesheet" href="{prefix}/{STYLESHEET}" media="all" />\n'
    page = page[:body.end()] + '\n' + markup[lang] + page[body.end():]
    page = page[:head_end] + link + page[head_end:]
    open(file, 'w', encoding='utf-8').write(page)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    args = parser.parse_args()
    if datetime.datetime.now(datetime.timezone.utc) >= END:
        print('LSTE banner: event over, nothing added')
        return
    root = os.path.abspath(args.root)
    markup = banners()
    count = 0
    for folder, folders, files in os.walk(root):
        relative = os.path.relpath(folder, root)
        if relative.split(os.sep)[0] in ('assets', 'wp-content', 'ux-enhance'):
            folders[:] = []
            continue
        for name in files:
            if name == 'index.html':
                count += add_banner(os.path.join(folder, name), root, markup)
    print(f'LSTE banner: {count} pages')


if __name__ == '__main__':
    main()
