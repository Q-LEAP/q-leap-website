"""Page speed, without changing what the pages look like. A publishing step: the deploy workflow
runs it on the copy of the site it publishes (--root _site), so the repository keeps the pages as
generated (export + components.py, trainings, blog, UX layer) and no generated CSS.

1. Styles: the 70-100 stylesheets WordPress printed for a page (<!-- wp-styles --> block, in cascade
   order) become one file, assets/css/bundle/<hash>.css, without the rules that cannot match the page:
   a rule is dropped only when one of its selectors' classes or ids appears nowhere in the page nor
   in the site's scripts (the scripts add classes at run time). Order, media queries, @font-face and
   @keyframes are kept (unused ones and exact duplicates excepted).
2. Images: photos heavier than 250 kB get a WebP copy at the same size (assets/…/<name>.<ext>.webp)
   used by the pages; the originals stay (social sharing, CMS). Images below the first screen load
   lazily.
   WebP copies are committed next to their originals (created once, reused by every deploy).
Usage: python3 tools/perf/optimize.py [--root DIR] [page.html …]   (default: every page of DIR)"""
import hashlib
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if '--root' in sys.argv:
    ROOT = os.path.abspath(sys.argv[sys.argv.index('--root') + 1])
    del sys.argv[sys.argv.index('--root'):sys.argv.index('--root') + 2]
BUNDLES = os.path.join(ROOT, 'assets', 'css', 'bundle')
SCRIPTS = ['assets/js/main.js', 'assets/js/ux.js', 'assets/js/vendor/swiper-5.4.5.min.js']
# Classes that libraries build at run time from pieces (Swiper: modifierClass + type/direction…)
DYNAMIC_PREFIXES = ('swiper-',)
WEBP_MIN_BYTES = 250 * 1024
WEBP_QUALITY = 84
BLOCK = re.compile(r'<!-- wp-styles(?::bundle)? -->\n?(.*?)\n?<!-- /wp-styles -->', re.S)


# ---------------------------------------------------------------- CSS

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
    return items


FUNCTIONAL = re.compile(r':(?:not|is|where|has|matches|-webkit-any|-moz-any)\(')


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
    return parts


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
            text += open(os.path.join(ROOT, href), errors='ignore').read()
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
    css = re.sub(r'url\((["\']?)([^)"\']+\.(?:jpe?g|png))\1\)', lambda m: f'url({m.group(1)}{m.group(2)}.webp{m.group(1)})'
                 if not re.match(r'(data:|https?:|//)', m.group(2)) and webp_copy(os.path.normpath(os.path.join(BUNDLES, m.group(2)))) else m.group(0), css, flags=re.I)
    digest = hashlib.sha1(css.encode()).hexdigest()[:12]
    os.makedirs(BUNDLES, exist_ok=True)
    target = os.path.join(BUNDLES, digest + '.css')
    if not os.path.exists(target):
        open(target, 'w').write(css)
    return f'assets/css/bundle/{digest}.css', len(css)


# ---------------------------------------------------------------- images

def webp_copy(path):
    """<file>.webp next to a heavy JPEG/PNG (created once); None when not worth it."""
    if not re.search(r'\.(jpe?g|png)$', path, re.I) or not os.path.isfile(path) or os.path.getsize(path) < WEBP_MIN_BYTES:
        return None
    target = path + '.webp'
    if not os.path.exists(target):
        from PIL import Image
        with Image.open(path) as image:
            if image.mode not in ('RGB', 'RGBA'):
                image = image.convert('RGBA' if 'transparency' in image.info or image.mode in ('LA', 'P') else 'RGB')
            image.save(target, 'WEBP', quality=WEBP_QUALITY, method=6)
        if os.path.getsize(target) >= os.path.getsize(path):
            open(target + '.skip', 'w').close()
    if os.path.exists(target + '.skip'):
        return None
    return target


def use_webp(markup, page_dir):
    def swap(url):
        clean = html.unescape(url)
        if re.match(r'(data:|https?:|//|#)', clean) or not re.search(r'\.(jpe?g|png)$', clean, re.I):
            return url
        file = os.path.normpath(os.path.join(ROOT, page_dir, clean))
        return url + '.webp' if webp_copy(file) else url

    markup = re.sub(r'\b(src|data-src|poster)="([^"]+)"', lambda m: f'{m.group(1)}="{swap(m.group(2))}"', markup)
    markup = re.sub(r'\b(srcset|data-srcset)="([^"]+)"', lambda m: m.group(1) + '="' + ', '.join(
        ' '.join([swap(part.strip().split(' ')[0])] + part.strip().split(' ')[1:]) for part in m.group(2).split(',') if part.strip()) + '"', markup)
    return re.sub(r'url\((&quot;|["\']?)([^)"\'&]+)(&quot;|["\']?)\)', lambda m: f'url({m.group(1)}{swap(m.group(2))}{m.group(3)})', markup)


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
        return img.replace('<img ', '<img loading="lazy" ', 1) if 'decoding=' in img else img.replace('<img ', '<img loading="lazy" decoding="async" ', 1)
    return head + re.sub(r'<img\s[^>]*>', tag, body)


# ---------------------------------------------------------------- pages

def pages():
    found = []
    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [name for name in dirs if not name.startswith('.') and name not in ('tools', 'docs', 'node_modules', 'assets')]
        found += [os.path.relpath(os.path.join(folder, name), ROOT) for name in files if name.endswith('.html')]
    return sorted(found)


def optimize(file, script_text):
    path = os.path.join(ROOT, file)
    markup = open(path, newline='').read()
    match = BLOCK.search(markup)
    if not match:
        return None
    if '<!-- wp-styles:bundle -->' in markup:
        return None  # already optimized
    block = match.group(1)
    page_dir = os.path.dirname(file)
    prefix = '../' * file.count('/')
    rest = markup[:match.start()] + markup[match.end():]
    tokens = page_tokens(rest + block, script_text)
    href, size = bundle(block, rest, page_dir, tokens)
    markup = markup[:match.start()] + f'<!-- wp-styles:bundle -->\n<link rel="stylesheet" href="{prefix}{href}">\n<!-- /wp-styles -->' + markup[match.end():]
    markup = lazy_images(use_webp(markup, page_dir))
    open(path, 'w', newline='').write(markup)
    return size


if __name__ == '__main__':
    script_text = ''.join(open(os.path.join(ROOT, script), errors='ignore').read() for script in SCRIPTS if os.path.exists(os.path.join(ROOT, script)))
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
            used.update(re.findall(r'assets/css/bundle/([0-9a-f]+\.css)', open(os.path.join(ROOT, file), errors='ignore').read()))
        for name in os.listdir(BUNDLES):
            if name.endswith('.css') and name not in used:
                os.remove(os.path.join(BUNDLES, name))
    print(f'{count} pages, CSS moyen {total // max(count, 1) // 1024} ko, {len(os.listdir(BUNDLES))} fichiers dans assets/css/bundle/')
