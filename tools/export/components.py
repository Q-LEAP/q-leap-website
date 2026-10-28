"""Remplace dans les pages exportées les composants WordPress qui dépendent de leur JavaScript
par des composants statiques (voir assets/css/hero.css et assets/js/main.js).

- Slider Revolution (<rs-module-wrap>) → .ql-hero, construit à partir des textes et images des slides.

Usage : python3 tools/export/components.py index.html en/index.html ...
"""
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def text_of(fragment):
    fragment = re.sub(r'<br\s*/?>', ' ', fragment)
    return html.unescape(re.sub(r'<[^>]+>', '', fragment)).strip()


def hero(module, prefix):
    slides = []
    for raw in module.split('<rs-slide ')[1:]:
        image = re.search(r'data-lazyload="([^"]+)"', raw).group(1)
        alt = (re.search(r'\balt="([^"]*)"', raw) or [0, ''])[1]
        zoom = re.search(r'data-panzoom="[^"]*ss:([\d.]+)%?;se:([\d.]+)%?', raw)
        zoom_from, zoom_to = [float(value) / 100 for value in zoom.groups()] if zoom else (1, 1)
        layers = {match.group(1): match.group(2) for match in re.finditer(r'<rs-layer\s+id="slider-\d+-slide-\d+-layer-(\d+)"[^>]*>(.*?)</rs-layer>', raw, re.S)}
        slides.append({
            'image': image, 'alt': alt, 'from': zoom_from, 'to': zoom_to,
            'kicker': text_of(layers.get('14', '')),
            'title': '<br>'.join(html.escape(text_of(part)) for part in re.split(r'<br\s*/?>', layers.get('1', ''))),
            'text': text_of(layers.get('12', '')),
        })
    image_path = lambda url: prefix + 'assets/images/' + (url.split('/wp-content/uploads/')[1] if '/wp-content/uploads/' in url else url.split('assets/images/')[1])
    parts = ['<section class="ql-hero" aria-roledescription="carousel" aria-label="Q-Leap" data-hero-duration="9000">']
    for index, slide in enumerate(slides):
        heading = 'h1' if index == 0 else 'h2'
        loading = 'fetchpriority="high"' if index == 0 else 'loading="lazy"'
        parts.append(
            f'<div class="ql-hero__slide" role="group" aria-roledescription="slide" aria-label="{index + 1} / {len(slides)}" '
            f'style="--hero-zoom-from: {slide["from"]:g}; --hero-zoom-to: {slide["to"]:g}">'
            f'<div class="ql-hero__background"><img src="{image_path(slide["image"])}" alt="{html.escape(slide["alt"])}" '
            f'{loading} decoding="async"></div>'
            '<div class="ql-hero__shade"></div>'
            '<div class="ql-hero__band"></div>'
            f'<div class="ql-hero__middle"><div class="ql-hero__middle-row"><p class="ql-hero__kicker">{html.escape(slide["kicker"])}</p>'
            f'<{heading} class="ql-hero__title">{slide["title"]}</{heading}></div></div>'
            f'<div class="ql-hero__bottom"><div class="ql-hero__bottom-column"><span class="ql-hero__index">0{index + 1}</span>'
            f'<p class="ql-hero__text">{html.escape(slide["text"])}</p></div></div>'
            '</div>')
    parts.append('<div class="ql-hero__buttons">'
                 '<button type="button" class="ql-hero__button ql-hero__button--next" aria-label="Next slide"><i class="material-icons" aria-hidden="true">chevron_right</i></button>'
                 '<button type="button" class="ql-hero__button ql-hero__button--previous" aria-label="Previous slide"><i class="material-icons" aria-hidden="true">chevron_left</i></button>'
                 '</div></section>')
    return ''.join(parts)


def process(path):
    full = os.path.join(ROOT, path)
    markup = open(full).read()
    prefix = '../' * path.count('/')
    markup = markup.replace('?export=1&amp;', '?').replace('?export=1&', '?').replace('&amp;export=1', '').replace('&export=1', '').replace('?export=1', '')
    match = re.search(r'<rs-module-wrap.*?</rs-module-wrap>', markup, re.S)
    if match:
        markup = markup[:match.start()] + hero(match.group(0), prefix) + markup[match.end():]
        if 'assets/css/hero.css' not in markup:
            markup = markup.replace('assets/css/main.css">', 'assets/css/main.css">\n<link rel="stylesheet" href="' + prefix + 'assets/css/hero.css">', 1)
        print(path, 'hero rebuilt')
    if 'elementor-invisible' in markup and 'assets/css/animations.css' not in markup:
        markup = markup.replace('assets/css/main.css">', 'assets/css/main.css">\n<link rel="stylesheet" href="' + prefix + 'assets/css/animations.css">', 1)
    swiper = f'<script src="{prefix}assets/js/vendor/swiper-5.4.5.min.js" defer></script>\n'
    if 'swiper-5.4.5.min.js' not in markup and 'slider_swiper' in markup:
        markup = markup.replace(f'<script src="{prefix}assets/js/main.js"', swiper + f'<script src="{prefix}assets/js/main.js"', 1)
    open(full, 'w').write(markup)


if __name__ == '__main__':
    for page in sys.argv[1:]:
        process(page)
