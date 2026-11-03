"""What changed on q-leap.eu since the export? Compares each snapshot in tools/export/raw/ (server HTML
at export time) with the live page: visible text, images and links. Read-only on WordPress; pages are
fetched one at a time (the site answers 429 to parallel requests).
Usage: python3 tools/export/diff_live.py [slug…] > report.json"""
import difflib, html, json, os, re, sys, time, urllib.request

EXPORT = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36'}


def url_for(slug):
    return 'https://q-leap.eu/' + ('' if slug == 'home' else slug.replace('__', '/') + '/')


def body(markup):
    markup = markup.split('<body', 1)[-1]
    markup = re.sub(r'<(script|style|noscript)\b.*?</\1>', ' ', markup, flags=re.S)
    return re.sub(r'<!--.*?-->', ' ', markup, flags=re.S)


# Leftovers of tags split over lines, per-request ids and dates, relative times ("13 heures ago")
NOISE = re.compile(r'^[a-z-]+=|=["\']|^<|^\d+ (?:secondes?|minutes?|heures?|jours?|semaines?|mois|ans?|seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago$')


def texts(markup):
    markup = re.sub(r'<(br|/p|/div|/h\d|/li|/a|/span|/button|/td|/th|/figcaption)\b[^>]*>', '\n', body(markup))
    lines = (html.unescape(re.sub(r'<[^>]+>', ' ', line)) for line in markup.split('\n'))
    lines = (re.sub(r'\s+', ' ', line).strip() for line in lines)
    return [l for l in lines if l and not NOISE.search(l)]


def media(markup):
    found = re.findall(r'(?:src|data-src|data-bg|poster|data-lazyload)=["\']([^"\']+)', body(markup))
    found += re.findall(r'url\((?:&quot;)?([^)&]+\.(?:jpe?g|png|webp|gif|svg|mp4))', body(markup))
    out = []
    for url in found:
        match = re.search(r'/wp-content/uploads/([^?"\']+)', html.unescape(url))
        if match:
            out.append(match.group(1))
    return sorted(set(out))


def links(markup):
    return sorted(set(h for h in re.findall(r'href=["\'](https://q-leap\.eu/[^"\'#?]*)', body(markup)) if '/wp-' not in h))


def fetch(url):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url + '?nocache=' + str(int(time.time())), headers=UA)
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read().decode('utf8', 'ignore')
        except Exception as error:
            if getattr(error, 'code', None) == 404:
                return None
            time.sleep(5 * (attempt + 1))
    return None


def compare(slug):
    old = open(os.path.join(EXPORT, 'raw', slug + '.html')).read()
    new = fetch(url_for(slug))
    if new is None:
        return {'slug': slug, 'url': url_for(slug), 'status': 'unreachable'}
    text = [l for l in difflib.unified_diff(texts(old), texts(new), lineterm='', n=0) if l[:1] in '+-' and l[:3] not in ('+++', '---')]
    old_media, new_media = media(old), media(new)
    old_links, new_links = links(old), links(new)
    return {'slug': slug, 'url': url_for(slug),
            'text': text,
            'media_added': [m for m in new_media if m not in old_media], 'media_removed': [m for m in old_media if m not in new_media],
            'links_added': [l for l in new_links if l not in old_links], 'links_removed': [l for l in old_links if l not in new_links]}


if __name__ == '__main__':
    slugs = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(os.path.join(EXPORT, 'raw')) if f.endswith('.html'))
    report = []
    for slug in slugs:
        report.append(compare(slug))
        print(slug, len(report[-1].get('text', [])), file=sys.stderr)
        time.sleep(1)
    json.dump(report, sys.stdout, ensure_ascii=False, indent=1)
