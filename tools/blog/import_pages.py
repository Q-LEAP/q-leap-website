"""One-off import: the 67 exported blog posts (FR and EN) → content/blog/<lang>/<slug>.json, the
format edited in Pages CMS and read by tools/blog/build.mjs. Reads the exported pages only (no
WordPress access). Posts whose body is a single Elementor text block get their text as `body`
(editable); the others keep their original layout (`layout: original`, body left empty).
The excerpt and the featured image (used by the listings) come from the public REST API of
q-leap.eu (read-only GET), as WordPress chose them (manual excerpt, else the start of the text).
Usage: python3 tools/blog/import_pages.py [path…]   (paths like "en/<slug>"; default: the inventory)"""
import html
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = 'https://q-leap.eu/'


def post_paths():
    inventory = json.load(open(os.path.join(ROOT, 'tools', 'inventory', 'inventory.json')))
    for item in inventory:
        if item['kind'] == 'Article' and item['decision'] == 'Garder':
            yield item['lang'], item['url'][len(SITE):].strip('/')


def wordpress_posts(lang):
    """slug → (excerpt text, featured image path) from the REST API."""
    url = f'{SITE}wp-json/wp/v2/posts?per_page=100&lang={lang}&_embed=wp:featuredmedia&_fields=slug,excerpt,_links,_embedded'
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    posts = json.load(urllib.request.urlopen(request, timeout=90))
    found = {}
    for post in posts:
        text = html.unescape(re.sub(r'<[^>]+>', '', post['excerpt']['rendered'])).strip()
        text = re.sub(r'\s*\[(?:…|&hellip;|\.\.\.)\]$', '', text).strip()
        media = (post.get('_embedded', {}).get('wp:featuredmedia') or [{}])[0].get('source_url', '')
        image = 'assets/images/' + media.split('/wp-content/uploads/')[1] if '/wp-content/uploads/' in media else ''
        found[post['slug']] = (text, image)
    time.sleep(1)
    return found


def download(path):
    """Featured images that no exported page used are fetched from WordPress (read-only)."""
    target = os.path.join(ROOT, path)
    if path and not os.path.exists(target):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        request = urllib.request.Request(SITE + 'wp-content/uploads/' + path[len('assets/images/'):], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=90) as response, open(target, 'wb') as handle:
            handle.write(response.read())


def meta(page, attribute, name):
    match = re.search(rf'<meta {attribute}="{re.escape(name)}" content="([^"]*)"', page)
    return html.unescape(match.group(1)) if match else ''


# Same pattern as tools/blog/build.py: the text block runs up to the closing tags of the Elementor
# section, just before the related-posts placeholder (the text itself may contain <div>s).
BODY = re.compile(r'data-widget_type="text-editor\.default">\s*<div class="elementor-widget-container">(.*)'
                  r'</div>\s*</div>\s*</div>\s*</div>\s*</div>\s*</section>\s*</div>\s*<div id=\'jp-relatedposts\'', re.S)


def text_widget_body(page):
    """The text of a post made of a single Elementor text block, else None (original layout kept)."""
    start = page.find('data-elementor-type="wp-post"')
    end = page.find("<div id='jp-relatedposts'", start)
    widgets = re.findall(r'data-widget_type="([^"]+)"', page[start:end])
    if widgets != ['text-editor.default'] or page[start:end].count('elementor-top-section') != 1:
        return None
    match = BODY.search(page, start)
    return match.group(1).strip('\n\t') if match else None


def parse(lang, path):
    page = open(os.path.join(ROOT, path, 'index.html')).read()
    slug = path.split('/')[-1]
    header = page[page.find('<div class="post_header post_header_single'):page.find('<div class="post_content post_content_single')]
    categories = [html.unescape(name) for name in re.findall(r'rel="category tag">([^<]+)</a>', header)]
    # Single style 6 puts the title in the post header, style 7 in the page title bar.
    heading = re.search(r'<h1 class="(?:post_title entry-title|sc_layouts_title_caption)">(.*?)</h1>', page, re.S)
    title = html.unescape(re.sub(r'<[^>]+>', '', heading.group(1))).strip()
    featured = re.search(r'<div class="post_featured[^"]*">\s*<img [^>]*?src="([^"]+)"[^>]*?(?:alt="([^"]*)")?', header)
    image = re.sub(r'^(\.\./)+', '', featured.group(1)) if featured else ''
    footer = page[page.find('<div class="post_footer post_footer_single'):]
    tags = [html.unescape(name) for name in re.findall(r'rel="tag">([^<]+)</a>', footer[:footer.find('</div>')])]
    linked = json.loads(re.search(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S).group(1))
    article = next(node for node in linked['@graph'] if node.get('@type') in ('Article', 'BlogPosting'))
    other = 'en' if lang == 'fr' else 'fr'
    switch = re.search(rf'wpml-ls-item-{other}\b[^>]*><a href="([^"]+)"', page)
    translation = ''
    if switch:
        target = re.sub(r'^(\.\./)+', '', switch.group(1)).strip('/')
        target = target[3:] if target.startswith('en/') else target
        if target and target not in ('blog', 'en', 'en/blog') and os.path.exists(os.path.join(ROOT, ('en/' if other == 'en' else '') + target, 'index.html')):
            translation = target
    views = re.search(r'<span class="post_meta_number">([^<]*)</span>', header)
    body = text_widget_body(page)
    post_id = re.search(r'postid-(\d+)', page).group(1)
    return slug, {
        'title': title,
        'date': article['datePublished'][:10],
        'status': 'published',
        'categories': categories,
        'tags': tags,
        'image': image,
        'excerpt': '',
        'description': meta(page, 'property', 'og:description'),
        'seoTitle': html.unescape(re.search(r'<title>(.*?)</title>', page, re.S).group(1)),
        'translation': translation,
        'body': body or '',
        'layout': 'simple' if body is not None else 'original',
        'postId': int(post_id),
        'published': article['datePublished'],
        'modified': article.get('dateModified', ''),
        'views': html.unescape(views.group(1)) if views else '',
    }


if __name__ == '__main__':
    counts = {}
    paths = [('en' if path.startswith('en/') else 'fr', path.strip('/')) for path in sys.argv[1:]] or list(post_paths())
    rest = {lang: wordpress_posts(lang) for lang in {lang for lang, _ in paths}}
    for lang, path in paths:
        slug, post = parse(lang, path)
        excerpt, image = rest[lang].get(slug, ('', ''))
        post['excerpt'] = excerpt
        if image:  # WordPress' featured image (the page may show a resized copy)
            download(image)
            post['image'] = image
        folder = os.path.join(ROOT, 'content', 'blog', lang)
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, slug + '.json'), 'w') as handle:
            json.dump(post, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
        counts[(lang, post['layout'])] = counts.get((lang, post['layout']), 0) + 1
    print(counts)
