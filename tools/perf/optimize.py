"""Page speed, without changing what the pages look like. A publishing step: the deploy workflow
runs it on the copy of the site it publishes (--root _site), so the repository keeps the pages as
generated (export + components.py, trainings, blog, UX layer) and no generated CSS.

1. Styles: the 70-100 stylesheets WordPress printed for a page (<!-- wp-styles --> block, in cascade
   order) become one file, assets/css/bundle/<hash>.css, without the rules that cannot match the page:
   a rule is dropped only when one of its selectors' classes or ids appears nowhere in the page nor
   in the site's scripts (the scripts add classes at run time). Order, media queries, @font-face and
   @keyframes are kept (unused ones and exact duplicates excepted). Fonts the stylesheets embed
   in base64 (over 4 kB) become files next to the bundles, downloaded only when used.
2. Images: photos heavier than 40 kB get a WebP copy at the same size (assets/…/<name>.<ext>.webp)
   used by the pages; the originals stay (social sharing, CMS). WebP uploads too (many were saved
   near-lossless by WordPress): their copy is kept when it is at least 20 % lighter. Images below the first screen load
   lazily.
   WebP copies are committed next to their originals (created once, reused by every deploy).
3. Icon fonts (fontello, trx_addons_icons…: woff2 files whose characters are all private-use
   codepoints, no letters) keep only the icons the published pages can show: codepoints written in the bundles,
   the other stylesheets the pages link, the pages and the scripts. Published copy only (--root):
   the repository keeps the full fonts, so an icon added later comes back at the next deploy. Needs
   fontTools and brotli (pip install fonttools brotli); skipped without them.
4. Stylesheets that only fed the bundles (assets/css/wp/…, main.css: ~170 files, 12 MB) are not
   published when no page, script or stylesheet names them any more. Published copy only.
5. Text fonts show their text in a fallback font while they load (font-display: swap; the home page
   title, set in europa, stayed invisible up to 3 s on a phone). Icon fonts keep their setting.
6. Small stylesheets the pages link besides the bundle (static.css, hero.css, lste-promo.css: a few kB
   each) are written into the page: one request less each before the first paint on a phone.
7. Large images get lighter copies at a few widths (srcset), so a phone or a small column downloads
   the size it shows; SVG icons without width/height get the ones written in the file.
8. assets/css/a11y.css (contrast of the theme's greys, slider dots) on every page.
9. Accessibility of the exported markup: heading levels that skip a level get the level they stand
   for (aria-level), and the language switcher's links lose role="menuitem" (no menu around them).
Usage: python3 tools/perf/optimize.py [--root DIR] [page.html …]   (default: every page of DIR)"""
import functools
import hashlib
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUBLISHED_COPY = '--root' in sys.argv
if PUBLISHED_COPY:
    ROOT = os.path.abspath(sys.argv[sys.argv.index('--root') + 1])
    del sys.argv[sys.argv.index('--root'):sys.argv.index('--root') + 2]
BUNDLES = os.path.join(ROOT, 'assets', 'css', 'bundle')
SCRIPTS = ['assets/js/main.js', 'assets/js/ux.js', 'assets/js/vendor/swiper-5.4.5.min.js']
# Classes that libraries build at run time from pieces (Swiper: modifierClass + type/direction…;
# intl-tel-input: one flag class per country, iti__<iso2>, chosen from assets/js/phone-countries.json)
DYNAMIC_PREFIXES = ('swiper-', 'iti__', 'iti--')
WEBP_MIN_BYTES = 40 * 1024
WEBP_QUALITY = 84
# Images that get a lighter WebP copy: JPEG/PNG, and WebP uploads saved at a high quality (the
# copy of a WebP is kept only when it is at least WEBP_MIN_GAIN lighter). Not the copies themselves.
WEBP_SOURCE = r'(?<!\.jpg)(?<!\.jpeg)(?<!\.png)(?<!\.webp)\.(?:jpe?g|png|webp)'
WEBP_MIN_GAIN = 0.2
INLINE_FONT_MAX = 4 * 1024  # base64 characters; smaller fonts (Swiper's arrows, 2.3 kB) stay in the CSS
# Families drawn with private-use characters or ligatures: a fallback font would show the codes, not icons
ICON_FONT_WORDS = ('icon', 'fontello', 'awesome', 'eicons', 'material', 'dashicons', 'star', 'rating', 'swiper')
INLINE_CSS_MAX = 6 * 1024
A11Y_CSS = 'assets/css/a11y.css'
# Widths of the lighter copies (srcset); an image gets the ones below its own width
RESPONSIVE_WIDTHS = (420, 840, 1440)
RESPONSIVE_MIN_WIDTH = 600
BLOCK = re.compile(r'<!-- wp-styles(?::bundle)? -->\n?(.*?)\n?<!-- /wp-styles -->', re.S)


# ---------------------------------------------------------------- CSS

@functools.lru_cache(maxsize=None)
def split_rules(css):
    """Top-level items of a stylesheet: ('rule', selector, body) or ('at', prelude, body|None)."""
    items, i, n = [], 0, len(css)
    while i < n:
        while i < n and css[i] in ' \t\r\n':
            i += 1
        if i >= n:
            break
        if css.startswith('/*', i):
            end = css.find('*/', i + 2)
            i = n if end < 0 else end + 2
            continue
        start = i
        depth, quote = 0, None
        while i < n:
            char = css[i]
            if quote:
                if char == '\\':
                    i += 2
                    continue
                if char == quote:
                    quote = None
            elif char in '"\'':
                quote = char
            elif css.startswith('/*', i):
                end = css.find('*/', i + 2)
                i = n if end < 0 else end + 2
                continue
            elif char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            elif char == ';' and depth == 0:
                items.append(('at', css[start:i].strip(), None))
                i += 1
                break
            elif char == '{' and depth == 0:
                prelude = css[start:i].strip()
                body_start, level = i + 1, 1
                i += 1
                while i < n and level:
                    char = css[i]
                    if quote:
                        if char == '\\':
                            i += 2
                            continue
                        if char == quote:
                            quote = None
                    elif char in '"\'':
                        quote = char
                    elif css.startswith('/*', i):
                        end = css.find('*/', i + 2)
                        i = n if end < 0 else end + 2
                        continue
                    elif char == '{':
                        level += 1
                    elif char == '}':
                        level -= 1
                    i += 1
                body = css[body_start:i - 1]
                items.append(('at' if prelude.startswith('@') else 'rule', prelude, body))
                break
            i += 1
        else:
            break
    return tuple(items)


FUNCTIONAL = re.compile(r':(?:not|is|where|has|matches|-webkit-any|-moz-any)\(')


@functools.lru_cache(maxsize=None)
def selector_tokens(selector):
    """Classes and ids a selector requires (those inside :not()/:is()… do not count)."""
    out, i = [], 0
    while True:
        match = FUNCTIONAL.search(selector, i)
        if not match:
            out.append(selector[i:])
            break
        out.append(selector[i:match.start()])
        depth, j = 1, match.end()
        while j < len(selector) and depth:
            depth += {'(': 1, ')': -1}.get(selector[j], 0)
            j += 1
        i = j
    plain = re.sub(r'\[[^\]]*\]', '', ''.join(out))
    return re.findall(r'[.#](-?[_a-zA-Z -￿][\w -￿-]*)', plain)


@functools.lru_cache(maxsize=None)
def split_selectors(prelude):
    """Selector list split on the commas that are not inside (), [] or quotes."""
    parts, depth, quote, start = [], 0, None, 0
    for index, char in enumerate(prelude):
        if quote:
            if char == quote:
                quote = None
        elif char in '"\'':
            quote = char
        elif char in '([':
            depth += 1
        elif char in ')]':
            depth -= 1
        elif char == ',' and depth == 0:
            parts.append(prelude[start:index])
            start = index + 1
    parts.append(prelude[start:])
    return tuple(parts)


def purge(css, tokens):
    kept = []
    for kind, prelude, body in split_rules(css):
        if kind == 'rule':
            selectors = [s for s in split_selectors(prelude) if all(t in tokens or t.startswith(DYNAMIC_PREFIXES) for t in selector_tokens(s))]
            if selectors:
                kept.append(','.join(s.strip() for s in selectors) + '{' + minify_body(body) + '}')
        elif body is None:
            if not re.match(r'@(charset|import)\b', prelude):  # only valid at the top of a file
                kept.append(prelude + ';')
        elif re.match(r'@(media|supports|layer|container|document|-moz-document)\b', prelude):
            inner = purge(body, tokens)
            if inner:
                kept.append(prelude + '{' + inner + '}')
        else:  # @font-face, @keyframes, @page…: kept as they are
            kept.append(prelude + '{' + minify_body(body) + '}')
    return ''.join(kept)


def prune_unused(css, tokens, outside=''):
    """Second pass on the whole bundle: exact duplicates of @font-face / @keyframes go, and so do
    animations and font families that nothing uses (neither the remaining rules nor the page)."""
    items = split_rules(css)
    used_text = ''.join(prelude + '{' + (body or '') + '}' for kind, prelude, body in items
                        if not re.match(r'@(-\w+-)?(keyframes|font-face)\b', prelude))
    used_words = set(re.findall(r'[\w-]+', used_text.lower())) | {token.lower() for token in tokens}
    # font families may also be set by the site's own stylesheets (hero.css, ux.css…) or inline
    # styles; a family is kept when its name appears in any of them (quoted or not, with !important…)
    font_text = (used_text + outside).lower()
    seen, kept = set(), []
    for kind, prelude, body in items:
        text = prelude + ('{' + body + '}' if body is not None else ';')
        frame = re.match(r'@(?:-\w+-)?keyframes\s+([\w-]+)', prelude)
        if frame and frame.group(1).lower() not in used_words and frame.group(1) not in outside:
            continue
        if prelude.startswith('@font-face'):
            family = re.search(r'font-family:\s*["\']?([^;"\']+)', body or '')
            if family and family.group(1).strip().lower() not in font_text:
                continue
        if (frame or prelude.startswith('@font-face')) and text in seen:
            continue
        seen.add(text)
        kept.append(text)
    return '\n'.join(kept)


@functools.lru_cache(maxsize=None)
def minify_body(body):
    body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
    return re.sub(r'\s*([;:{},])\s*', r'\1', re.sub(r'\s+', ' ', body)).strip().rstrip(';')


def page_tokens(markup, script_text):
    words = set(re.findall(r'[\w -￿-]+', html.unescape(markup)))
    words.update(re.findall(r'[\w -￿-]+', script_text))
    return words


def absolute_asset(url, page_dir):
    """A url() of an inline <style> is relative to the page: make it relative to assets/css/bundle/."""
    if re.match(r'(data:|https?:|//|#)', url):
        return url
    path = os.path.normpath(os.path.join(page_dir, url))
    return os.path.relpath(os.path.join(ROOT, path), BUNDLES).replace(os.sep, '/')


def site_css(page):
    """Stylesheets the page loads besides the WordPress block (hero.css, static.css, ux.css…) and its inline styles."""
    text = ' '.join(re.findall(r'style="([^"]*)"', page))
    for href in re.findall(r'<link[^>]*rel="stylesheet"[^>]*href="[./]*(assets/css/[^"]+\.css)"', page):
        if '/bundle/' not in href and os.path.exists(os.path.join(ROOT, href)):
            text += open(os.path.join(ROOT, href), encoding='utf-8', errors='ignore').read()
    return text


def bundle(block, page, page_dir, tokens):
    parts = []
    for match in re.finditer(r'<link[^>]*href="([^"]+\.css)"[^>]*>|<style[^>]*>(.*?)</style>', block, re.S):
        if match.group(1):
            file = os.path.normpath(os.path.join(ROOT, page_dir, match.group(1)))
            css = open(file, encoding='utf-8', errors='ignore').read()
            # files in assets/css/wp/ and assets/css/ (elementor-pro, …) both sit two levels below the root
            if os.path.dirname(file) == os.path.join(ROOT, 'assets', 'css'):
                css = re.sub(r'url\((["\']?)(?!data:|https?:|//|#|\.\./)', r'url(\1../', css)
        else:
            css = re.sub(r'url\((["\']?)([^)"\']+)\1\)', lambda m: f'url({m.group(1)}{absolute_asset(m.group(2), page_dir)}{m.group(1)})', match.group(2))
        parts.append(purge(css, tokens))
    css = prune_unused('\n'.join(part for part in parts if part), tokens, site_css(page))
    # Heavy background images get their WebP copy too (paths are relative to assets/css/bundle/)
    css = re.sub(r'url\((["\']?)([^)"\']+' + WEBP_SOURCE + r')\1\)', lambda m: f'url({m.group(1)}{m.group(2)}.webp{m.group(1)})'
                 if not re.match(r'(data:|https?:|//)', m.group(2)) and webp_copy(os.path.normpath(os.path.join(BUNDLES, m.group(2)))) else m.group(0), css, flags=re.I)
    css = re.sub(r'url\((["\']?)data:([^;,)]*font[^;,)]*)(?:;[^,)]*)?;base64,([A-Za-z0-9+/=]+)\1\)', inline_font_file, css)
    css = swap_text_fonts(css)
    digest = hashlib.sha1(css.encode()).hexdigest()[:12]
    os.makedirs(BUNDLES, exist_ok=True)
    target = os.path.join(BUNDLES, digest + '.css')
    if not os.path.exists(target):
        open(target, 'w', encoding='utf-8').write(css)
    return f'assets/css/bundle/{digest}.css', len(css)


def swap_text_fonts(css):
    """@font-face of text fonts without font-display (or auto / block, which hide the text up to 3 s):
    font-display: swap. Icon fonts are left as they are."""
    def fix(match):
        body = match.group(1)
        family = re.search(r'font-family:\s*["\']?([^;"\']+)', body)
        if not family or any(word in family.group(1).lower() for word in ICON_FONT_WORDS):
            return match.group(0)
        if re.search(r'font-display:\s*(swap|fallback|optional)', body):
            return match.group(0)
        body = re.sub(r';?\s*font-display:\s*[\w-]+', '', body).strip().rstrip(';')
        return '@font-face{' + body + ';font-display:swap}'
    return re.sub(r'@font-face\s*\{([^}]*)\}', fix, css)


def inline_small_stylesheets(markup, page_dir):
    """<link rel="stylesheet"> to a small file of the site (not a bundle) becomes a <style> with the
    file's rules, url()s made relative to the page."""
    def inline(match):
        href = html.unescape(match.group(1))
        if re.match(r'(https?:|//)', href) or '/bundle/' in href:
            return match.group(0)
        file = os.path.normpath(os.path.join(ROOT, page_dir, href))
        if not os.path.isfile(file) or os.path.getsize(file) > INLINE_CSS_MAX:
            return match.group(0)
        base = os.path.dirname(href)
        css = open(file, encoding='utf-8').read()
        css = re.sub(r'url\((["\']?)(?!data:|https?:|//|#)([^)"\']+)\1\)',
                     lambda url: f'url({url.group(1)}{os.path.normpath(os.path.join(base, url.group(2))).replace(os.sep, "/")}{url.group(1)})', css)
        media = re.search(r'\bmedia="([^"]*)"', match.group(0))
        media = f' media="{media.group(1)}"' if media and media.group(1) != 'all' else ''
        return f'<style{media}>/* {href} */\n{css.strip()}\n</style>'
    return re.sub(r'<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+\.css)"[^>]*>', inline, markup)


def inline_font_file(match):
    """A font written into the CSS as base64 travels with every page that loads the stylesheet, used
    or not (the quiz's "Rating" star font: 15 kB on every page). Above INLINE_FONT_MAX it becomes a
    file next to the bundles, which the browser downloads only if some text needs it."""
    quote, mime, data = match.groups()
    if len(data) <= INLINE_FONT_MAX:
        return match.group(0)
    import base64
    content = base64.b64decode(data)
    extension = next((ext for key, ext in (('woff2', 'woff2'), ('woff', 'woff'), ('otf', 'otf'), ('opentype', 'otf')) if key in mime), 'ttf')
    name = hashlib.sha1(content).hexdigest()[:12] + '.' + extension
    os.makedirs(BUNDLES, exist_ok=True)
    if not os.path.exists(os.path.join(BUNDLES, name)):
        open(os.path.join(BUNDLES, name), 'wb').write(content)
    return f'url({quote}{name}{quote})'


# ---------------------------------------------------------------- images

def webp_copy(path):
    """<file>.webp next to a heavy JPEG/PNG/WebP (created once); None when not worth it."""
    if not re.search(WEBP_SOURCE + '$', path, re.I) or not os.path.isfile(path) or os.path.getsize(path) < WEBP_MIN_BYTES:
        return None
    target = path + '.webp'
    if not os.path.exists(target):
        from PIL import Image
        with Image.open(path) as image:
            if getattr(image, 'is_animated', False):  # only the first frame would be kept
                open(target + '.skip', 'w').close()
                return None
            if image.mode not in ('RGB', 'RGBA'):
                image = image.convert('RGBA' if 'transparency' in image.info or image.mode in ('LA', 'P') else 'RGB')
            image.save(target, 'WEBP', quality=WEBP_QUALITY, method=6)
        limit = os.path.getsize(path) * (1 - WEBP_MIN_GAIN if path.lower().endswith('.webp') else 1)
        if os.path.getsize(target) >= limit:
            open(target + '.skip', 'w').close()
    if os.path.exists(target + '.skip'):
        return None
    return target


def use_webp(markup, page_dir):
    def swap(url):
        clean = html.unescape(url)
        if re.match(r'(data:|https?:|//|#)', clean) or not re.search(WEBP_SOURCE + '$', clean, re.I):
            return url
        file = os.path.normpath(os.path.join(ROOT, page_dir, clean))
        return url + '.webp' if webp_copy(file) else url

    markup = re.sub(r'\b(src|data-src|poster)="([^"]+)"', lambda m: f'{m.group(1)}="{swap(m.group(2))}"', markup)
    markup = re.sub(r'\b(srcset|data-srcset)="([^"]+)"', lambda m: m.group(1) + '="' + ', '.join(
        ' '.join([swap(part.strip().split(' ')[0])] + part.strip().split(' ')[1:]) for part in m.group(2).split(',') if part.strip()) + '"', markup)
    return re.sub(r'url\((&quot;|["\']?)([^)"\'&]+)(&quot;|["\']?)\)', lambda m: f'url({m.group(1)}{swap(m.group(2))}{m.group(3)})', markup)


@functools.lru_cache(maxsize=None)
def image_size(path):
    if path.lower().endswith('.svg'):
        head = open(path, encoding='utf-8', errors='ignore').read(1000)
        tag = re.search(r'<svg\b[^>]*>', head)
        width = tag and re.search(r'\swidth="([\d.]+)(?:px)?"', tag.group(0))
        height = tag and re.search(r'\sheight="([\d.]+)(?:px)?"', tag.group(0))
        return (round(float(width.group(1))), round(float(height.group(1)))) if width and height else None
    try:
        from PIL import Image
        with Image.open(path) as image:
            return image.size
    except Exception:
        return None


def resized_copy(path, width):
    """<image>-<width>w.webp next to the image (created once), from the original when it exists."""
    stem = path[:-5] if path.endswith('.webp') and re.search(WEBP_SOURCE + r'\.webp$', path, re.I) else path
    target = re.sub(r'\.webp$', '', stem) + f'-{width}w.webp'
    if not os.path.exists(target):
        from PIL import Image
        source = stem if os.path.exists(stem) else path
        with Image.open(source) as image:
            image = image.convert('RGBA' if image.mode in ('RGBA', 'LA', 'P') else 'RGB')
            image.resize((width, round(image.height * width / image.width)), Image.LANCZOS).save(target, 'WEBP', quality=WEBP_QUALITY, method=6)
    return target


def responsive_images(markup, page_dir):
    """Lighter copies (srcset) for large images that have none, and sizes="auto" on lazy images with a
    srcset: the browser picks the copy for the size the image is shown at (the theme's sizes said
    840px for the 347px slider thumbnails). SVG icons without width/height get the file's."""
    try:
        import PIL  # noqa: F401
    except ImportError:
        return markup

    def tag(match):
        img = match.group(0)
        src = re.search(r'\ssrc="([^"]+)"', img)
        if not src or re.match(r'(data:|https?:|//)', src.group(1)):
            return img
        file = os.path.normpath(os.path.join(ROOT, page_dir, html.unescape(src.group(1))))
        size = image_size(file) if os.path.isfile(file) else None
        if not size:
            return img
        img = re.sub(r'(\sloading="lazy")(?=[^>]*\sloading=)', '', img)  # the export wrote it twice
        # SVG icons (language flags) only: some theme images are 0×0 on purpose until hovered (the
        # "fit" pictures of the home page), and dimensions would give them their file's size
        if file.endswith('.svg') and not re.search(r'\swidth=', img) and not re.search(r'\sheight=', img):
            img = re.sub(r'^<img\s', f'<img width="{size[0]}" height="{size[1]}" ', img)
        lazy = 'loading="lazy"' in img
        if 'srcset=' not in img and not file.endswith('.svg') and size[0] >= RESPONSIVE_MIN_WIDTH and (lazy or 'ql-hero' in match.string[max(0, match.start() - 200):match.start()]):
            folder = os.path.dirname(src.group(1))
            candidates = [f'{folder}/{os.path.basename(resized_copy(file, width))} {width}w' for width in RESPONSIVE_WIDTHS if width < size[0] * 0.9]
            if candidates:
                if lazy:
                    shown = re.search(r'\swidth="(\d+)"', img)
                    shown = shown.group(1) if shown else size[0]
                    sizes = f'auto, (max-width: {shown}px) 100vw, {shown}px'
                else:  # hero background: full width, cover (as tall as the screen)
                    sizes = f'max(100vw, {round(100 * size[0] / size[1])}vh)'
                img = re.sub(r'^<img\s', f'<img srcset="{", ".join(candidates + [src.group(1) + f" {size[0]}w"])}" sizes="{sizes}" ', img)
        elif lazy and 'srcset=' in img and 'sizes="auto' not in img:
            img = re.sub(r'\ssizes="([^"]*)"', r' sizes="auto, \1"', img) if ' sizes="' in img else img
        return img
    return re.sub(r'<img\s[^>]*>', tag, markup)


HEADING = re.compile(r'<h([1-6])\b([^>]*)>')


def heading_levels(markup):
    """A heading one level below the enclosing one at most: the theme's widgets print fixed tags (an h4
    service title after an h2, an h6 over a section), which screen readers announce as skipped levels.
    The tag and its look stay; aria-level gives the level it stands for (siblings keep the same one)."""
    body = markup.find('<body')
    open_levels = []  # (tag level, level given) of the headings the current one sits under

    def level(match):
        tag_level = int(match.group(1))
        while open_levels and open_levels[-1][0] >= tag_level:
            open_levels.pop()
        given = re.search(r'aria-level="(\d)"', match.group(2))
        wanted = int(given.group(1)) if given else min(tag_level, open_levels[-1][1] + 1 if open_levels else tag_level)
        open_levels.append((tag_level, wanted))
        if given or wanted == tag_level:
            return match.group(0)
        return f'<h{tag_level} aria-level="{wanted}"{match.group(2)}>'
    return markup[:body] + HEADING.sub(level, markup[body:])


def language_menu_roles(markup):
    """WPML printed role="menuitem" on the language links of a plain <ul> (no role="menu" around them)."""
    if re.search(r'role="(menu|menubar)"', markup):
        return markup
    return re.sub(r'(<a\b[^>]*?)\srole="menuitem"', r'\1', markup)


def lazy_images(markup):
    """Images after the first two of the page content load when they come near the screen (not logos)."""
    content_start = max(markup.find('<div class="page_content_wrap'), 0)
    head, body = markup[:content_start], markup[content_start:]
    count = [0]

    def tag(match):
        img = match.group(0)
        count[0] += 1
        if count[0] <= 2 or 'loading=' in img or 'fetchpriority' in img or 'logo_image' in img:
            return img
        # The tag may continue on the next line (<img\n src=…, The Events Calendar's markup)
        attributes = 'loading="lazy" ' if 'decoding=' in img else 'loading="lazy" decoding="async" '
        return re.sub(r'^<img\s+', '<img ' + attributes, img, count=1)
    return header_logos(head) + re.sub(r'<img\s[^>]*>', tag, body)


def header_logos(head):
    """The header logo is the mobile LCP element, but the theme printed it with loading="lazy": the browser
    found it only after layout. Header logos load eagerly, the first one with high priority."""
    first = [True]

    def eager(match):
        img = re.sub(r'\sloading="lazy"', '', match.group(0), count=1)
        if first[0] and 'fetchpriority' not in img:
            img = re.sub(r'^<img\s+', '<img fetchpriority="high" ', img, count=1)
            first[0] = False
        return img
    return re.sub(r'<img\s[^>]*class="logo_image"[^>]*>', eager, head)


# ---------------------------------------------------------------- icon fonts

def used_codepoints(page_files):
    """Private-use characters the site can display: CSS escapes (content: "\\e800"), HTML entities, raw characters."""
    texts = [os.path.join(ROOT, file) for file in page_files]
    linked = set()
    for file in texts:
        linked.update(re.findall(r'href="[./]*(assets/css/[^"]+\.css)"', open(file, encoding='utf-8', errors='ignore').read()))
    texts += [os.path.join(ROOT, href) for href in linked if os.path.exists(os.path.join(ROOT, href))]
    texts += [os.path.join(BUNDLES, name) for name in os.listdir(BUNDLES)]
    for folder, dirs, files in os.walk(os.path.join(ROOT, 'assets', 'js')):
        texts += [os.path.join(folder, name) for name in files if name.endswith('.js')]
    used = set()
    for file in texts:
        text = open(file, encoding='utf-8', errors='ignore').read()
        used.update(int(code, 16) for code in re.findall(r'\\([0-9a-fA-F]{4,5})(?![0-9a-fA-F])', text))
        used.update(int(code, 16) for code in re.findall(r'&#x([0-9a-fA-F]{4,5});', text))
        used.update(ord(char) for char in text if '\ue000' <= char <= '\uf8ff')
    return used


def subset_icon_fonts(used):
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
    except ImportError:
        print("Polices d'icônes non réduites (pip install fonttools brotli)")
        return
    saved = 0
    for folder, dirs, files in os.walk(os.path.join(ROOT, 'assets', 'fonts')):
        for name in files:
            path = os.path.join(folder, name)
            if not name.endswith('.woff2'):
                continue
            font = TTFont(path)
            codes = set(font.getBestCmap())
            icons = {code for code in codes if 0xE000 <= code <= 0xF8FF}
            if len(icons) < 0.9 * len(codes) or codes & set(range(ord('a'), ord('z') + 1)):
                continue  # text fonts, and icon fonts drawn from words (Material Icons ligatures)
            keep = (codes & used) | (codes - icons)
            if keep == codes:
                continue
            options = subset.Options()
            options.flavor = 'woff2'
            options.name_IDs = ['*']
            options.notdef_outline = True
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=keep or [min(codes)])  # an empty font is not valid woff2
            subsetter.subset(font)
            before = os.path.getsize(path)
            font.save(path)
            saved += before - os.path.getsize(path)
    print(f"Polices d'icônes : {saved // 1024} ko de moins")


def drop_bundled_stylesheets():
    """Removes the stylesheets outside assets/css/bundle/ whose file name appears in no page, script,
    stylesheet or data file of the published copy (matched by name, so any reference keeps a file)."""
    named = set()
    for folder, dirs, files in os.walk(ROOT):
        for name in files:
            if name.endswith(('.html', '.js', '.css', '.json', '.xml', '.txt', '.webmanifest')):
                text = open(os.path.join(folder, name), encoding='utf-8', errors='ignore').read()
                named.update(os.path.basename(match) for match in re.findall(r'[\w./%-]+\.css\b', text))
    removed, size = 0, 0
    for folder, dirs, files in os.walk(os.path.join(ROOT, 'assets', 'css')):
        dirs[:] = [name for name in dirs if os.path.join(folder, name) != BUNDLES]
        for name in files:
            if name.endswith('.css') and name not in named:
                path = os.path.join(folder, name)
                size += os.path.getsize(path)
                os.remove(path)
                removed += 1
    for folder, dirs, files in sorted(os.walk(os.path.join(ROOT, 'assets', 'css')), reverse=True):
        if folder != BUNDLES and not os.listdir(folder):
            os.rmdir(folder)
    print(f'Feuilles de style déjà dans les bundles, non publiées : {removed} ({size // 1024 // 1024} Mo)')


# ---------------------------------------------------------------- pages

def pages():
    found = []
    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [name for name in dirs if not name.startswith('.') and name not in ('tools', 'docs', 'node_modules', 'assets')]
        found += [os.path.relpath(os.path.join(folder, name), ROOT).replace(os.sep, '/') for name in files if name.endswith('.html')]
    return sorted(found)


PANEL = re.compile(r'<div\s+id="([\w-]+)"\s+class="[^"]*\bsc_layouts_panel\b[^"]*"')


def drop_unreachable_panels(markup):
    """ThemeREX side panels (sc_layouts_panel) open only from a link to "#<id>" (or on page load,
    which no page uses). Most pages carry the theme demo's left panel ("Features", "Blog Layouts"…)
    with no such link: invisible and unreachable, it goes, before the CSS is purged for the page."""
    for match in reversed(list(PANEL.finditer(markup))):
        panel_id, start = match.group(1), match.start()
        head = markup[start:markup.find('>', start)]
        if f'href="#{panel_id}"' in markup or f'data-panel-id="{panel_id}"' in markup or 'sc_layouts_show_on_page' in head:
            continue
        depth = 0
        for tag in re.finditer(r'<(/?)div\b[^>]*>', markup[start:]):
            depth += -1 if tag.group(1) else 1
            if depth == 0:
                markup = markup[:start] + markup[start + tag.end():]
                break
    return markup


def optimize(file, script_text):
    path = os.path.join(ROOT, file)
    markup = open(path, encoding='utf-8', newline='').read()
    match = BLOCK.search(markup)
    if not match:
        return None
    if '<!-- wp-styles:bundle -->' in markup:
        return None  # already optimized
    markup = drop_unreachable_panels(markup)
    match = BLOCK.search(markup)
    block = match.group(1)
    page_dir = os.path.dirname(file)
    prefix = '../' * file.count('/')
    rest = markup[:match.start()] + markup[match.end():]
    tokens = page_tokens(rest + block, script_text)
    href, size = bundle(block, rest, page_dir, tokens)
    markup = markup[:match.start()] + f'<!-- wp-styles:bundle -->\n<link rel="stylesheet" href="{prefix}{href}">\n<!-- /wp-styles -->' + markup[match.end():]
    if os.path.exists(os.path.join(ROOT, A11Y_CSS)) and A11Y_CSS not in markup:
        markup = markup.replace('<!-- /wp-styles -->', f'<!-- /wp-styles -->\n<link rel="stylesheet" href="{prefix}{A11Y_CSS}">', 1)
    markup = responsive_images(lazy_images(use_webp(markup, page_dir)), page_dir)
    markup = language_menu_roles(heading_levels(inline_small_stylesheets(markup, page_dir)))
    open(path, 'w', encoding='utf-8', newline='').write(markup)
    return size


if __name__ == '__main__':
    script_text = ''.join(open(os.path.join(ROOT, script), encoding='utf-8', errors='ignore').read() for script in SCRIPTS if os.path.exists(os.path.join(ROOT, script)))
    files = sys.argv[1:] or pages()
    total, count = 0, 0
    for file in files:
        size = optimize(file, script_text)
        if size is not None:
            total += size
            count += 1
    if not sys.argv[1:]:  # full run: bundles no page uses any more are generated files, removed
        used = set()
        for file in pages():
            used.update(re.findall(r'assets/css/bundle/([0-9a-f]+\.css)', open(os.path.join(ROOT, file), encoding='utf-8', errors='ignore').read()))
        for name in os.listdir(BUNDLES):
            if name.endswith('.css') and name not in used:
                os.remove(os.path.join(BUNDLES, name))
        if PUBLISHED_COPY:
            subset_icon_fonts(used_codepoints(pages()))
            drop_bundled_stylesheets()
    print(f'{count} pages, CSS moyen {total // max(count, 1) // 1024} ko, {len(os.listdir(BUNDLES))} fichiers dans assets/css/bundle/')
