"""Site search without WordPress: an index per language and a results page.

WordPress answered the header/sidebar search forms (?s=…) itself. Here:
- assets/search/fr.json and en.json list every page (title, address, description, image, text);
- sitemap.xml (and sitemap_index.xml, the address Yoast declared to search engines) lists them;
- search/index.html and en/search/index.html are copies of the blog listing whose cards are
  filled in the browser (assets/js/main.js, initSearch) with the pages matching ?s=.
Run after any page change (the Build content workflow does it). Usage: python3 tools/search/build.py
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP_DIRS = {'tools', 'reference', 'node_modules', 'content', 'assets', 'docs', 'search', 'category', 'tag',
             'portfolio_group', 'session', 'sessions', 'shop'}
TEXT_LIMIT = 4000
PAGES = {'fr': ('blog/index.html', 'search/index.html', 'Recherche'),
         'en': ('en/blog/index.html', 'en/search/index.html', 'Search')}
# Hero texts of the blog replaced on the results page: (kicker, title) of the blog → of the search.
HERO = {'fr': (("Suivez nos Actu'", 'Notre Blog', 'Nos actualités'), ('Q-Leap', 'Recherche', 'Recherche')),
        'en': (('Follow our News', 'Our Blog', 'Our news'), ('Q-Leap', 'Search', 'Search'))}


def text_of(fragment):
    fragment = re.sub(r'<(script|style|noscript|svg|form)\b.*?</\1>', ' ', fragment, flags=re.S | re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def meta(page, name):
    match = re.search(rf'<meta (?:name|property)="{name}" content="([^"]*)"', page)
    return html.unescape(match.group(1)) if match else ''


def entry(path, page):
    if re.search(r'http-equiv=["\']refresh', page, re.I) or re.search(r'<meta name="robots" content="[^"]*noindex', page):
        return None
    title = meta(page, 'og:title') or text_of(re.search(r'<title>(.*?)</title>', page, re.S).group(1))
    title = re.sub(r'\s+[-–|]\s+Q-Leap\s*$', '', title)
    start = page.find('class="page_content_wrap')
    end = page.find('<footer', start)
    body = text_of(page[start:end]) if start > 0 else ''
    image = meta(page, 'og:image')
    return {'u': path, 't': title, 'd': meta(page, 'og:description') or meta(page, 'description'),
            'i': image.replace('https://q-leap.eu/', '') if image.startswith('https://q-leap.eu/') else '',
            'x': body[:TEXT_LIMIT]}


def index():
    entries = {'fr': [], 'en': []}
    for directory, subdirectories, files in os.walk(ROOT):
        relative = os.path.relpath(directory, ROOT)
        subdirectories[:] = sorted(name for name in subdirectories if not name.startswith('.') and name not in SKIP_DIRS)
        if 'index.html' not in files:
            continue
        with open(os.path.join(directory, 'index.html'), encoding='utf-8') as handle:
            page = handle.read()
        language = 'en' if re.search(r'<html[^>]*lang="en', page) else 'fr'
        path = '' if relative == '.' else relative.replace(os.sep, '/') + '/'
        item = entry(path, page)
        if item:
            entries[language].append(item)
    return entries


def results_page(language):
    source, target, label = PAGES[language]
    with open(os.path.join(ROOT, source), encoding='utf-8') as handle:
        page = handle.read()
    # The blog cards become one empty list; the pagination is rebuilt by initBlogPagination.
    page = re.sub(r'(<div class="sc_blogger_content[^"]*"[^>]*data-cards-per-page="\d+")>.*?(</div><nav )',
                  r'\1 data-ql-search>\2', page, count=1, flags=re.S)
    page = page.replace('<title>Blog - Q-Leap</title>', f'<title>{label} - Q-Leap</title>')
    for old, new in zip(*HERO[language]):
        page = re.sub(rf'(<span class="sc_item_(?:subtitle|title_text)[^"]*">){re.escape(old)}\s*</span>', rf'\g<1>{new}</span>', page)
    page = re.sub(r'<link rel="canonical"[^>]*>\s*', '', page)
    page = re.sub(r'(<meta name="robots" content=")[^"]*', r'\1noindex, follow', page, count=1)
    if 'name="robots"' not in page:
        page = page.replace('<head>', '<head>\n<meta name="robots" content="noindex, follow">', 1)
    os.makedirs(os.path.dirname(os.path.join(ROOT, target)), exist_ok=True)
    with open(os.path.join(ROOT, target), 'w', encoding='utf-8') as handle:
        handle.write(page)


def sitemap(entries):
    urls = ''.join(f'<url><loc>https://q-leap.eu/{html.escape(item["u"])}</loc></url>\n'
                   for language in ('fr', 'en') for item in entries[language])
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as handle:
        handle.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                     + urls + '</urlset>\n')
    with open(os.path.join(ROOT, 'sitemap_index.xml'), 'w', encoding='utf-8') as handle:
        handle.write('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                     '<sitemap><loc>https://q-leap.eu/sitemap.xml</loc></sitemap>\n</sitemapindex>\n')


def main():
    entries = index()
    sitemap(entries)
    os.makedirs(os.path.join(ROOT, 'assets/search'), exist_ok=True)
    for language, items in entries.items():
        with open(os.path.join(ROOT, f'assets/search/{language}.json'), 'w', encoding='utf-8') as handle:
            json.dump(items, handle, ensure_ascii=False, separators=(',', ':'))
        results_page(language)
        print(language, len(items), 'pages indexed')


if __name__ == '__main__':
    main()
