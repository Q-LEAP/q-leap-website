"""Export de pages q-leap.eu (WordPress) vers le site statique.

Pour chaque page : HTML serveur d'origine, sans les scripts WordPress (remplacés par assets/js/main.js),
liens internes rendus relatifs, images et polices copiées dans assets/. Les feuilles de style sont
rassemblées dans l'ordre de la cascade dans tools/export/build/css/ (une par page) puis fusionnées
par merge_css.py.

Le fichier Elementor uploads/elementor/css/custom-frontend.min.css renvoie 404 sur le site en ligne
depuis le 28/10/2026 13:38 : on utilise la version reconstituée de tools/reference/.

Usage : python3 tools/export/export.py https://q-leap.eu/ https://q-leap.eu/en/ ...
"""
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXPORT = os.path.join(ROOT, 'tools', 'export')
SITE = 'https://q-leap.eu'
FIXED_ELEMENTOR_CSS = os.path.join(ROOT, 'tools', 'reference', 'custom-frontend.min.css')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36'}
FONT_EXT = ('.woff2', '.woff', '.ttf', '.otf', '.eot', '.svg')
IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico')
VIDEO_EXT = ('.mp4', '.webm')

downloaded = {}
text_cache = {}


def fetch(url, binary=False, tries=3):
    # Stylesheets and fonts are shared by every page: fetch each once per run.
    cacheable = not binary and '/wp-content/' in url or 'fonts' in url
    if cacheable and url in text_cache:
        return text_cache[url]
    result = _fetch(url, binary, tries)
    if cacheable:
        text_cache[url] = result
    return result


def _fetch(url, binary=False, tries=3):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as response:
                data = response.read()
                return data if binary else data.decode('utf8', 'ignore')
        except Exception as error:
            if getattr(error, 'code', None) == 404 or attempt == tries - 1:
                print('  ! ', getattr(error, 'code', error), url)
                return None
            time.sleep(2)


def absolute(url, base):
    url = html.unescape(url.strip().strip('"\''))
    if url.startswith('//'):
        url = 'https:' + url
    return urllib.parse.urljoin(base, url)


def original_image(url):
    """Photon (i0.wp.com/q-leap.eu/...) → original upload, without resizing parameters."""
    match = re.match(r'https://i\d\.wp\.com/(q-leap\.eu/.*?)(\?.*)?$', url)
    if match:
        return 'https://' + match.group(1)
    return url


def photon_crop(url):
    """Photon ?resize=W,H crops to an exact size: keep that version (the page relies on its ratio)."""
    match = re.match(r'https://i\d\.wp\.com/q-leap\.eu/(.*?)\?(.*)$', html.unescape(url))
    if not match:
        return None
    size = re.search(r'(?:^|&)resize=(\d+)(?:%2C|,)(\d+)', match.group(2))
    if not size:
        return None
    path = urllib.parse.unquote('/' + match.group(1))
    stem, ext = os.path.splitext(path)
    return f'https://i0.wp.com/q-leap.eu{urllib.parse.quote(path)}?resize={size.group(1)}%2C{size.group(2)}&ssl=1', f'{stem}-{size.group(1)}x{size.group(2)}{ext}'


def local_asset(url, kind):
    """Download url once and return its path relative to the repo root (assets/...)."""
    crop = photon_crop(url)
    if crop and '/wp-content/uploads/' in crop[1]:
        source, path = crop
        if source in downloaded:
            return downloaded[source]
        rel = os.path.join('assets', kind, path.split('/wp-content/uploads/')[1])
        target = os.path.join(ROOT, rel)
        if not os.path.exists(target):
            data = fetch(source, binary=True)
            if data is None:
                return original_asset(url, kind)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            open(target, 'wb').write(data)
        downloaded[source] = rel
        return rel
    return original_asset(url, kind)


def original_asset(url, kind):
    url = original_image(url)
    clean = url.split('#')[0]
    if clean in downloaded:
        return downloaded[clean]
    parsed = urllib.parse.urlparse(clean)
    path = urllib.parse.unquote(parsed.path)
    name = os.path.basename(path) or 'index'
    if parsed.netloc.endswith('q-leap.eu') and '/wp-content/uploads/' in path:
        rel = os.path.join('assets', kind, path.split('/wp-content/uploads/')[1])
    else:
        digest = hashlib.sha1(clean.encode()).hexdigest()[:8]
        rel = os.path.join('assets', kind, 'ext', f'{digest}-{name}')
    target = os.path.join(ROOT, rel)
    if not os.path.exists(target):
        data = fetch(clean, binary=True)
        if data is None:
            downloaded[clean] = clean
            return clean
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as handle:
            handle.write(data)
    downloaded[clean] = rel
    return rel


def kind_for(url):
    path = urllib.parse.urlparse(url).path.lower()
    if path.endswith(FONT_EXT) and ('font' in path or not path.endswith('.svg')):
        return 'fonts'
    if path.endswith(VIDEO_EXT):
        return 'videos'
    return 'images'


def localise_css(css, base):
    """Rewrite url(...) in a stylesheet to repo-root-relative asset paths (prefixed later)."""
    def replace(match):
        raw = match.group(1).strip().strip('"\'')
        if raw.startswith('data:') or not raw:
            return match.group(0)
        url = absolute(raw, base)
        return f'url("/{local_asset(url, kind_for(url))}")'
    return re.sub(r'url\(([^)]+)\)', replace, css)


def resolve_imports(css, base):
    def replace(match):
        url = absolute(match.group(1) or match.group(2), base)
        inner = fetch(url) or ''
        return resolve_imports(inner, url)
    return re.sub(r'@import\s+(?:url\()?["\']?([^"\')\s;]+)["\']?\)?[^;]*;|@import\s+url\(([^)]+)\);', replace, css)


def rebuild_elementor_breakpoint_css(href):
    """Elementor writes uploads/elementor/css/custom-*.min.css from its own default files with the
    site's breakpoints; several of them are missing (404) since 28/10/2026 13:38. Rebuild them from
    the plugin's default file: same configuration except the tablet breakpoint (1279 px, not 1024)."""
    name = os.path.basename(urllib.parse.urlparse(href).path)
    plugin = 'elementor-pro' if name.startswith('custom-pro-') else 'elementor'
    default_name = name.replace('custom-pro-', '').replace('custom-', '')
    base = f'{SITE}/wp-content/plugins/{plugin}/assets/css/'
    css = fetch(base + default_name)
    if css is None:
        return '', base
    print('  ~ rebuilt', name, 'from', plugin, default_name)
    return css.replace('max-width:1024px', 'max-width:1279px').replace('min-width:1025px', 'min-width:1280px'), base


def stylesheet_chunks(head_and_body, page_url):
    chunks = []
    for match in re.finditer(r'<link[^>]*rel=["\']stylesheet["\'][^>]*>|<style[^>]*>.*?</style>', head_and_body, re.S):
        tag = match.group(0)
        media = (re.search(r'media=["\']([^"\']+)', tag) or [0, 'all'])[1]
        if tag.startswith('<link'):
            href = absolute(re.search(r'href=["\']([^"\']+)', tag).group(1), page_url)
            if 'custom-frontend.min.css' in href:
                css = open(FIXED_ELEMENTOR_CSS).read()
                base = SITE + '/wp-content/plugins/elementor/assets/css/'
            else:
                css = fetch(href)
                base = href
                if css is None and '/uploads/elementor/css/custom-' in href:
                    css, base = rebuild_elementor_breakpoint_css(href)
                css = css or ''
            ident = (re.search(r'id=["\']([^"\']+)', tag) or [0, href])[1]
        else:
            css = re.sub(r'^<style[^>]*>|</style>$', '', tag, flags=re.S)
            base = page_url
            ident = (re.search(r'id=["\']([^"\']+)', tag) or [0, 'inline'])[1]
        css = localise_css(resolve_imports(css, base), base)
        if media not in ('all', 'screen', ''):
            css = f'@media {media} {{\n{css}\n}}'
        chunks.append({'id': ident, 'css': css})
    return chunks


def page_path(url):
    path = urllib.parse.urlparse(url).path.strip('/')
    return os.path.join(path, 'index.html') if path else 'index.html'


def relative_prefix(path):
    depth = path.count('/')
    return '../' * depth


def localise_html(markup, page_url, prefix):
    def media_url(raw):
        url = absolute(raw, page_url)
        if not re.match(r'https://(q-leap\.eu|i\d\.wp\.com/q-leap\.eu)/', url):
            return raw
        if '/wp-content/' not in url:
            return raw
        return prefix + local_asset(url, kind_for(original_image(url)))

    def replace_attr(match):
        name, quote, value = match.group(1), match.group(2), match.group(3)
        if name in ('srcset', 'data-srcset'):
            parts = []
            for candidate in value.split(','):
                bits = candidate.strip().split()
                if bits:
                    bits[0] = media_url(bits[0])
                    parts.append(' '.join(bits))
            value = ', '.join(dict.fromkeys(parts))
        else:
            value = media_url(value)
        return f'{name}={quote}{value}{quote}'

    markup = re.sub(r'\b(src|srcset|data-src|data-srcset|data-bg|poster|data-lazyload|data-thumb)=(["\'])(.*?)\2', replace_attr, markup)
    markup = re.sub(r'url\(&quot;(.*?)&quot;\)|url\(([^)&]+)\)',
                    lambda m: f'url({media_url(m.group(1) or m.group(2))})' if (m.group(1) or m.group(2)) else m.group(0), markup)

    def link(match):
        quote, url = match.group(1), html.unescape(match.group(2))
        parsed = urllib.parse.urlparse(url)
        if parsed.netloc != 'q-leap.eu' or parsed.path.startswith(('/wp-content/', '/wp-admin', '/wp-json')):
            return match.group(0)
        path = parsed.path.strip('/')
        target = prefix + (path + '/' if path else '')
        if not target:
            target = './'
        if parsed.fragment:
            target += '#' + parsed.fragment
        return f'href={quote}{target}{quote}'
    return re.sub(r'href=(["\'])(https://q-leap\.eu[^"\']*)\1', link, markup)


def strip_runtime(markup):
    keep = []
    def script(match):
        tag = match.group(0)
        if 'application/ld+json' in tag:
            keep.append(tag)
            return tag
        return ''
    markup = re.sub(r'<script\b[^>]*>.*?</script>', script, markup, flags=re.S)
    markup = re.sub(r'<link[^>]*rel=["\'](?:stylesheet|preload|prefetch|preconnect|dns-prefetch|modulepreload|https://api\.w\.org/|EditURI|alternate|shortlink|pingback)["\'][^>]*>\s*', '', markup)
    markup = re.sub(r'<style\b[^>]*>.*?</style>\s*', '', markup, flags=re.S)
    markup = re.sub(r'<noscript>.*?</noscript>', '', markup, flags=re.S)
    markup = re.sub(r'<meta name=["\']generator["\'][^>]*>\s*', '', markup)
    markup = re.sub(r'<!--.*?-->', '', markup, flags=re.S)
    return markup


def export(url):
    print('page', url)
    source = fetch(url + ('&' if '?' in url else '?') + 'export=1')
    if not source:
        return
    os.makedirs(os.path.join(EXPORT, 'raw'), exist_ok=True)
    out_rel = page_path(url)
    slug = out_rel.replace('/index.html', '').replace('index.html', 'home').replace('/', '__')
    with open(os.path.join(EXPORT, 'raw', slug + '.html'), 'w') as handle:
        handle.write(source)
    chunks = stylesheet_chunks(source, url)
    os.makedirs(os.path.join(EXPORT, 'build', 'css'), exist_ok=True)
    with open(os.path.join(EXPORT, 'build', 'css', slug + '.json'), 'w') as handle:
        json.dump(chunks, handle)
    prefix = relative_prefix(out_rel)
    # The ?export=1 cache buster must not leak into canonical URLs, form actions, etc.
    source = source.replace('?export=1&amp;', '?').replace('?export=1&', '?').replace('&amp;export=1', '').replace('&export=1', '').replace('?export=1', '')
    markup = strip_runtime(source)
    markup = localise_html(markup, url, prefix)
    markup = markup.replace('</head>', f'<link rel="stylesheet" href="{prefix}assets/css/main.css">\n</head>', 1)
    markup = markup.replace('</body>', f'<script src="{prefix}assets/js/main.js" defer></script>\n</body>', 1)
    target = os.path.join(ROOT, out_rel)
    os.makedirs(os.path.dirname(target) or ROOT, exist_ok=True)
    with open(target, 'w') as handle:
        handle.write(markup)
    print('  →', out_rel, len(chunks), 'stylesheets')


if __name__ == '__main__':
    manifest = os.path.join(EXPORT, 'build', os.environ.get('MANIFEST', 'downloaded.json'))
    if os.path.exists(manifest):
        downloaded.update(json.load(open(manifest)))
    for page in sys.argv[1:]:
        export(page)
        os.makedirs(os.path.dirname(manifest), exist_ok=True)
        json.dump(downloaded, open(manifest, 'w'), indent=0)
