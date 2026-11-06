"""Language alternates and absolute canonical URLs, as WordPress (WPML + Yoast) printed them.

The export kept each page's canonical link but made it relative (./, ../page/), and dropped the
<link rel="alternate" hreflang="…"> tags that tell search engines which French page is the English
page's translation. This script puts them back in every indexable page, from the pages themselves:

- the translation is the page the language switcher (wpml-ls) links to, after following the
  redirect pages (meta refresh) and only if it is an indexable page in the other language that does
  not claim another translation; the pair is then written on both sides (hreflang must be mutual);
- like WPML: hreflang="en", hreflang="fr", then x-default = the French page (the page itself when it
  has no French version); a page without translation gets its own language and x-default;
- canonical: the same URL, absolute (https://q-leap.eu/…);
- redirect and noindex pages carry no alternates (the search pages are built from the blog page).

Idempotent: run it again after any build (the Build content workflow does, after the trainings,
blog and search pages are generated).
Usage: python3 tools/seo/alternates.py"""
import os
import posixpath
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = 'https://q-leap.eu/'
SKIP = {'tools', 'docs', 'assets', 'content', 'node_modules'}
SWITCHER = re.compile(r'<li class="[^"]*wpml-ls-item-(en|fr)[^"]*"[^>]*>\s*<a href="([^"]*)"')
ALTERNATE = re.compile(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*" />\r?\n')


def page_files():
    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [name for name in dirs if not name.startswith('.') and name not in SKIP]
        for name in files:
            if name.endswith('.html'):
                yield os.path.relpath(os.path.join(folder, name), ROOT).replace(os.sep, '/')


def key_of(file):
    """'en/contact/index.html' -> 'en/contact/' (the URL path), 'index.html' -> ''."""
    return file[:-len('index.html')] if file.endswith('index.html') else file


def resolve(key, href):
    path = posixpath.normpath(posixpath.join(key or '.', href))
    return '' if path == '.' else path.rstrip('/') + '/'


def read_pages():
    pages = {}
    for file in page_files():
        markup = open(os.path.join(ROOT, file), encoding='utf-8', newline='').read()
        key = key_of(file)
        refresh = re.search(r'<meta http-equiv="refresh" content="0; url=([^"]+)"', markup)
        lang = re.search(r'<html[^>]*\blang="([a-z]{2})', markup)
        pages[key] = {
            'file': file,
            'markup': markup,
            'redirect': resolve(key, refresh.group(1)) if refresh else None,
            'indexable': not refresh and not re.search(r'<meta name="robots" content="[^"]*noindex', markup),
            'lang': lang.group(1) if lang else None,
            'switcher': {code: resolve(key, href) for code, href in SWITCHER.findall(markup)},
        }
    return pages


def follow(pages, key):
    if key is None:
        return None
    for _ in range(4):
        page = pages.get(key)
        if not page or not page['redirect']:
            return key if page else None
        key = page['redirect']
    return None


def translations(pages):
    pairs = {}
    for key, page in pages.items():
        if not page['indexable'] or page['lang'] not in ('fr', 'en'):
            continue
        other = 'en' if page['lang'] == 'fr' else 'fr'
        target = follow(pages, page['switcher'].get(other))
        if target is None or target == key or not pages[target]['indexable'] or pages[target]['lang'] != other:
            continue
        back = follow(pages, pages[target]['switcher'].get(page['lang']))
        if back not in (key, None, target):
            continue  # the other page names a different translation (WPML fell back to a listing)
        if pairs.get(key, target) != target or pairs.get(target, key) != key:
            continue
        pairs[key], pairs[target] = target, key
    return pairs


def head_links(key, page, translation):
    versions = {page['lang']: key}
    if translation is not None:
        versions['en' if page['lang'] == 'fr' else 'fr'] = translation
    links = [f'<link rel="alternate" hreflang="{code}" href="{SITE}{versions[code]}" />' for code in ('en', 'fr') if code in versions]
    links.append(f'<link rel="alternate" hreflang="x-default" href="{SITE}{versions.get("fr", key)}" />')
    newline = '\r\n' if '\r\n' in page['markup'] else '\n'  # a Windows checkout (core.autocrlf) has CRLF
    return ''.join(link + newline for link in links)


def main():
    pages = read_pages()
    pairs = translations(pages)
    changed = 0
    for key, page in pages.items():
        markup = ALTERNATE.sub('', page['markup'])
        if not page['indexable'] or page['lang'] not in ('fr', 'en'):
            # no alternates on redirects and noindex pages (search/build.py copies the blog page's head)
            if markup != page['markup']:
                open(os.path.join(ROOT, page['file']), 'w', encoding='utf-8', newline='').write(markup)
                changed += 1
            continue
        canonical = re.search(r'<link rel="canonical" href="([^"]*)" />', markup)
        if not canonical:
            continue
        href = canonical.group(1)
        absolute = href if href.startswith('https://') else SITE + resolve(key, href)
        markup = markup[:canonical.start()] + head_links(key, page, pairs.get(key)) + f'<link rel="canonical" href="{absolute}" />' + markup[canonical.end():]
        if markup != page['markup']:
            open(os.path.join(ROOT, page['file']), 'w', encoding='utf-8', newline='').write(markup)
            changed += 1
    print(f'{changed} pages mises à jour, {len(pairs) // 2} paires FR/EN')


if __name__ == '__main__':
    main()
