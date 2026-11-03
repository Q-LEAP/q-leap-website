"""Blog: builds the post pages, the blog listings (blog/, en/blog/) and the home page news blocks
from content/blog/<lang>/<slug>.json (one file per post, edited in Pages CMS).

Existing post pages are updated in place (title, categories, date, featured image, text, SEO
metadata, tags, previous/next links), so posts exported from WordPress keep their exact markup and
styles; a new post starts from tools/blog/templates/post.<lang>.html (an exported post page).
Posts with `layout: original` keep their exported body: only their metadata is updated.

Image crops used by the listings (890x664, 370x370) are created with Pillow when missing.
Usage: python3 tools/blog/build.py"""
import html
import json
import math
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(ROOT, 'content', 'blog')
SITE = 'https://q-leap.eu'
LANGS = ('fr', 'en')
CARDS_PER_PAGE = 6
HOME_NEWS = 4
TEMPLATE_SLUG = {'fr': 'quand-les-testeurs-font-face-a-la-dette-de-processus', 'en': 'when-testers-face-process-debt'}
BLOG_PAGE = {'fr': 'blog', 'en': 'en/blog'}
BLOG_ORDER = {'fr': 'date', 'en': 'views'}
HOME_PAGE = {'fr': 'index.html', 'en': 'en/index.html'}
LABELS = {
    'fr': {'previous': 'Previous', 'next': 'Next', 'tags': 'Tags:', 'minute': 'minute', 'minutes': 'minutes',
           'read_more': 'Lire plus', 'next_page': 'Next page', 'last_page': 'Last page', 'first_page': 'First page',
           'previous_page': 'Previous page', 'page_of': 'Page {page} of {pages}'},
    'en': {'previous': 'Previous', 'next': 'Next', 'tags': 'Tags:', 'minute': 'minute', 'minutes': 'minutes',
           'read_more': 'Read more', 'next_page': 'Next page', 'last_page': 'Last page', 'first_page': 'First page',
           'previous_page': 'Previous page', 'page_of': 'Page {page} of {pages}'},
}
CATEGORY_SLUGS = {
    'fr': {'Actualités': 'actualites', 'Archives': 'archives', 'À la une': 'a-la-une', 'Carrière': 'carriere',
           'Events': 'events', 'Formation': 'formation', 'Innovation': 'innovation', 'Presse': 'presse'},
    'en': {'News': 'news', 'Archives': 'archives-en', 'Headlines': 'headlines', 'Career': 'career',
           'Events': 'events-en', 'Training': 'training', 'Innovation': 'innovation-en', 'Press': 'press'},
}


# ---------------------------------------------------------------- content

DRAFTS = []  # unpublished posts (load_posts)


def load_posts():
    posts = {lang: [] for lang in LANGS}
    for lang in LANGS:
        folder = os.path.join(CONTENT, lang)
        for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
            if name.endswith('.json'):
                post = json.load(open(os.path.join(folder, name)))
                post['slug'], post['lang'] = name[:-5], lang
                post['image'] = (post.get('image') or '').lstrip('/')
                post.setdefault('layout', 'simple')
                if post.get('status', 'published') != 'draft':
                    posts[lang].append(post)
                else:
                    DRAFTS.append(post)
        posts[lang].sort(key=lambda post: (published(post), post.get('postId') or 0), reverse=True)
    return posts


def published(post):
    """ISO date-time: the imported WordPress time when the date was not changed, else 09:00 UTC."""
    original = post.get('published') or ''
    if original[:10] == post['date']:
        return original
    return f"{post['date']}T09:00:00+00:00"


def page_dir(post):
    return os.path.join(ROOT, 'en' if post['lang'] == 'en' else '', post['slug'])


def url(post):
    return f"{SITE}/{'en/' if post['lang'] == 'en' else ''}{post['slug']}/"


def href(post, prefix):
    return f"{prefix}{'en/' if post['lang'] == 'en' else ''}{post['slug']}/"


def slugify(text):
    import unicodedata
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')


def texturize(text):
    """WordPress' wptexturize on titles, as the theme prints them in lists and navigation."""
    text = html.escape(text, quote=False)
    return text.replace("'", '&#8217;').replace(' - ', ' &#8211; ')


def body_html(post, prefix):
    """CMS images are stored as assets/… (or /assets/…): make them relative to the page."""
    return re.sub(r'(src|href)="/?assets/', rf'\1="{prefix}assets/', post.get('body') or '')


def plain_text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def excerpt(post, page):
    """Listing text: the excerpt field, else the first 30 words of the text (the theme's length)."""
    text = post.get('excerpt') or ''
    if not text:
        if post['layout'] == 'simple' and post.get('body'):
            source = post['body']
        else:
            start = page.find('data-elementor-type="wp-post"')
            source = page[start:page.find("<div id='jp-relatedposts'", start)]
        text = plain_text(source)
    words = text.split()
    return ' '.join(words[:30]) + ('&hellip;' if len(words) > 30 else '')


# ---------------------------------------------------------------- images

def image_size(path):
    from PIL import Image
    with Image.open(os.path.join(ROOT, path)) as image:
        return image.size


def crop(path, width, height):
    """WordPress-style centre crop <name>-<w>x<h>.<ext>, created next to the original if missing."""
    stem, ext = os.path.splitext(path)
    target = f'{stem}-{width}x{height}{ext}'
    if os.path.exists(os.path.join(ROOT, target)):
        return target
    from PIL import Image
    with Image.open(os.path.join(ROOT, path)) as image:
        scale = max(width / image.width, height / image.height)
        resized = image.resize((math.ceil(image.width * scale), math.ceil(image.height * scale)), Image.LANCZOS)
        left, top = (resized.width - width) // 2, (resized.height - height) // 2
        resized.crop((left, top, left + width, top + height)).save(os.path.join(ROOT, target), quality=88)
    return target


# ---------------------------------------------------------------- post pages

def sub_once(pattern, replacement, text, flags=re.S):
    return re.sub(pattern, lambda _: replacement, text, count=1, flags=flags)


def set_meta(page, attribute, name, value):
    escaped = html.escape(value, quote=True)
    return re.sub(rf'(<meta {attribute}="{re.escape(name)}" content=")[^"]*(")', lambda m: m.group(1) + escaped + m.group(2), page)


def categories_html(post, prefix, separator):
    links = []
    for name in post.get('categories') or []:
        slug = CATEGORY_SLUGS[post['lang']].get(name, slugify(name))
        folder = 'en/category' if post['lang'] == 'en' else 'category'
        links.append(f'<a href="{prefix}{folder}/{slug}/" rel="category tag">{html.escape(name, quote=False)}</a>')
    return f'<span class="post_meta_item_cat_separator">{separator}</span>'.join(links)


def tag_slugs(lang):
    """Tag name → slug, as WordPress printed them on the exported posts."""
    found = {}
    for post_lang in LANGS:
        folder = os.path.join(ROOT, 'en') if post_lang == 'en' else ROOT
        for name in os.listdir(os.path.join(CONTENT, post_lang)) if os.path.isdir(os.path.join(CONTENT, post_lang)) else []:
            page = os.path.join(folder, name[:-5], 'index.html')
            if post_lang == lang and os.path.exists(page):
                for slug, tag in re.findall(r'href="[./]*tag/([^/]+)/" rel="tag">([^<]+)</a>', open(page).read()):
                    found[html.unescape(tag)] = slug
    return found


def featured_html(post, prefix):
    width, height = image_size(post['image'])
    alt = html.escape(post.get('imageAlt') or '', quote=True)
    return (f'<div class="post_featured alignwide with_thumb"><img width="{width}" height="{height}" src="{prefix}{post["image"]}" '
            f'class="attachment-full size-full" alt="{alt}" decoding="async" /></div>')


def update_linked_data(page, post, changed, words):
    """Yoast's JSON-LD: only the fields whose source changed are rewritten."""
    match = re.search(r'(<script type="application/ld\+json"[^>]*>)(.*?)(</script>)', page, re.S)
    if not match or not changed:
        return page
    data = json.loads(match.group(2))
    image_url = f"{SITE}/{post['image']}" if post['image'] else ''
    for node in data.get('@graph', []):
        kind = node.get('@type')
        if kind in ('Article', 'BlogPosting', 'WebPage'):
            if 'title' in changed:
                node['headline' if kind != 'WebPage' else 'name'] = post['title'] if kind != 'WebPage' else seo_title(post)
            if 'date' in changed:
                node['datePublished'] = published(post)
                node['dateModified'] = post.get('modified') or published(post)
            if 'image' in changed and image_url:
                node['thumbnailUrl'] = image_url
        if kind in ('Article', 'BlogPosting'):
            if 'categories' in changed:
                node['articleSection'] = post.get('categories') or []
            if 'tags' in changed:
                node['keywords'] = post.get('tags') or []
            if 'body' in changed and words is not None:
                node['wordCount'] = words
        elif kind == 'WebPage' and 'description' in changed and post.get('description'):
            node['description'] = post['description']
        elif kind == 'ImageObject' and 'image' in changed and image_url:
            node['url'] = node['contentUrl'] = image_url
            node['width'], node['height'] = image_size(post['image'])
        elif kind == 'BreadcrumbList' and 'title' in changed:
            node['itemListElement'][-1]['name'] = post['title']
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('/', '\\/')
    return page[:match.start(2)] + serialized + page[match.end(2):]


def seo_title(post):
    return post.get('seoTitle') or f"{post['title']} - Q-Leap"


def navigation(post, older, newer, prefix):
    labels = LABELS[post['lang']]
    parts = []
    for item, side, rel, label in ((older, 'previous', 'prev', labels['previous']), (newer, 'next', 'next', labels['next'])):
        if item:
            parts.append(f'<div class="nav-{side}"><a href="{href(item, prefix)}" rel="{rel}"><span class="nav-arrow-label">{label}</span> '
                         f'<h6 class="post-title">{texturize(item["title"])}</h6><span class="post_date">{item["date"].replace("-", "/")}</span></a></div>')
    return f'<div class="nav-links">{"".join(parts)}</div>'


BODY = re.compile(r'(data-widget_type="text-editor\.default">\s*<div class="elementor-widget-container">)(.*)'
                  r'(</div>\s*</div>\s*</div>\s*</div>\s*</div>\s*</section>\s*</div>\s*<div id=\'jp-relatedposts\')', re.S)
TITLE = re.compile(r'(<h1 class="(?:post_title entry-title|sc_layouts_title_caption)">)(.*?)(</h1>)', re.S)
CATEGORIES = re.compile(r'(<div class="post_meta post_meta_categories"><span class="post_meta_item post_categories">)(.*?)(</span></div>)', re.S)
TAGS = re.compile(r'(<div class="post_footer post_footer_single entry-footer">\s*)(?:<div class="post_tags_single">(.*?)</div>)?', re.S)
NAV = re.compile(r'<div class="nav-links"><div class="nav-(?:previous|next)">.*?</a></div>(?:<div class="nav-next">.*?</a></div>)?</div>', re.S)


def current_values(page, prefix):
    """What the page shows now, in the content file's terms (to rewrite only what changed)."""
    first = lambda pattern, group=1: (re.search(pattern, page, re.S) or [None, None])[group]
    title = first(TITLE.pattern, 2)
    body = BODY.search(page)
    # The featured image as WordPress declared it (Yoast and Jetpack og:image: one may be a resized copy)
    images = set()
    for value in re.findall(r'<meta property="og:image" content="([^"]*)"', page):
        value = html.unescape(value).split('?')[0]
        path = 'assets/images/' + value.split('/wp-content/uploads/')[1] if '/wp-content/uploads/' in value else value.replace(SITE + '/', '')
        images.update({path, re.sub(r'-\d+x\d+(\.\w+)$', r'\1', path)})
    return {
        'title': html.unescape(re.sub(r'<[^>]+>', '', title)).strip() if title is not None else None,
        'seoTitle': html.unescape(first(r'<title>(.*?)</title>') or ''),
        'description': html.unescape(first(r'<meta property="og:description" content="([^"]*)" />') or ''),
        'date': first(r'<meta property="article:published_time" content="([^"]*)"') or '',
        'images': images,
        'categories': [html.unescape(name) for name in re.findall(r'rel="category tag">([^<]+)</a>', first(CATEGORIES.pattern, 2) or '')],
        'tags': [html.unescape(name) for name in re.findall(r'rel="tag">([^<]+)</a>', first(TAGS.pattern, 2) or '')],
        'body': body.group(2).strip('\n\t') if body else None,
        'views': first(r'<span class="post_meta_number">([^<]*)</span>'),
    }


def render_post(post, older, newer, tags, all_slugs):
    lang = post['lang']
    prefix = '../../' if lang == 'en' else '../'
    target = os.path.join(page_dir(post), 'index.html')
    created = not os.path.exists(target)
    source = os.path.join(HERE, 'templates', f'post.{lang}.html') if created else target
    page = open(source).read()
    if created:  # the template's address becomes this post's
        page = page.replace(f'/{TEMPLATE_SLUG[lang]}/', f'/{post["slug"]}/').replace('<html ', '<html data-blog-generated ', 1)
    now = current_values(page, prefix)
    changed = set()

    if now['title'] is not None and now['title'] != post['title']:
        changed.add('title')
        page = TITLE.sub(lambda m: m.group(1) + html.escape(post['title'], quote=False) + m.group(3), page, count=1)
        page = re.sub(r'(<meta property="og:title" content=")[^"]*("\s*/?>)', lambda m: m.group(1) + html.escape(post['title']) + m.group(2), page)
    if now['seoTitle'] != seo_title(post):
        changed.add('title')
        page = sub_once(r'<title>.*?</title>', f'<title>{html.escape(seo_title(post), quote=False)}</title>', page)
        page = re.sub(r'(<meta property="og:title" content=")[^"]*(" />)', lambda m: m.group(1) + html.escape(seo_title(post)) + m.group(2), page, count=1)
    if post.get('description') and now['description'] != post['description']:
        changed.add('description')
        page = re.sub(r'(<meta property="og:description" content=")[^"]*("\s*/?>)', lambda m: m.group(1) + html.escape(post['description']) + m.group(2), page)
    if now['date'] != published(post):
        changed.add('date')
        page = set_meta(page, 'property', 'article:published_time', published(post))
        page = set_meta(page, 'property', 'article:modified_time', post.get('modified') or published(post))
        page = re.sub(r'(<span class="post_meta_item post_date">)[^<]*(</span>)', lambda m: m.group(1) + post['date'].replace('-', '/') + m.group(2), page, count=1)
    if now['views'] is not None and str(post.get('views') or '0') != now['views']:
        page = re.sub(r'(<span class="post_meta_number">)[^<]*(</span>)', lambda m: m.group(1) + html.escape(str(post.get('views') or '0')) + m.group(2), page, count=1)
    if post['image'] and post['image'] not in now['images']:
        changed.add('image')
        page = re.sub(r'<div class="post_featured alignwide with_thumb">.*?</div>', lambda _: featured_html(post, prefix), page, count=1, flags=re.S)
        width, height = image_size(post['image'])
        page = re.sub(r'(<meta property="og:image" content=")[^"]*(")', lambda m: m.group(1) + html.escape(f"{SITE}/{post['image']}") + m.group(2), page)
        page = set_meta(page, 'property', 'og:image:width', str(width))
        page = set_meta(page, 'property', 'og:image:height', str(height))
        page = set_meta(page, 'property', 'og:image:type', 'image/png' if post['image'].endswith('.png') else 'image/jpeg')
    if now['categories'] != (post.get('categories') or []) and CATEGORIES.search(page):
        changed.add('categories')
        page = CATEGORIES.sub(lambda m: m.group(1) + categories_html(post, prefix, ' ') + m.group(3), page, count=1)

    words = None
    if post['layout'] == 'simple' and now['body'] is not None and now['body'] != body_html(post, prefix).strip('\n\t'):
        changed.add('body')
        page = BODY.sub(lambda m: m.group(1) + '\n\t\t\t\t\t\t\t\t\t\n' + body_html(post, prefix) + '\n\t\t\t\t\t\t\t\t' + m.group(3), page, count=1)
        words = len(plain_text(post['body']).split())
        minutes = max(1, round(words / 200))
        page = set_meta(page, 'name', 'twitter:data2', f"{minutes} {LABELS[lang]['minute' if minutes == 1 else 'minutes']}")

    if now['tags'] != (post.get('tags') or []):
        changed.add('tags')
        names = post.get('tags') or []
        tag_folder = 'en/tag' if lang == 'en' else 'tag'
        links = ''.join(f'<a href="{prefix}{tag_folder}/{tags.get(name, slugify(name))}/" rel="tag">{html.escape(name, quote=False)}</a>' for name in names)
        block = f'<div class="post_tags_single"><span class="post_meta_label">{LABELS[lang]["tags"]}</span> {links}</div>' if names else ''
        page = TAGS.sub(lambda m: m.group(1) + block, page, count=1)

    # Previous / next post among the posts of the static site
    page = NAV.sub(lambda _: navigation(post, older, newer, prefix), page, count=1)

    # Language switcher: the translation, else the other language's blog
    other = 'en' if lang == 'fr' else 'fr'
    translation = post.get('translation') or ''
    if translation in all_slugs[other]:
        other_href = f"{prefix}{'en/' if other == 'en' else ''}{translation}/"
    else:
        other_href = f"{prefix}{BLOG_PAGE[other]}/"
    if created or translation:
        page = re.sub(rf'(wpml-ls-item-{other}\b[^>]*><a href=")[^"]*(")', lambda m: m.group(1) + other_href + m.group(2), page)

    page = update_linked_data(page, post, changed, words)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    open(target, 'w').write(page)
    return os.path.relpath(target, ROOT), created


# ---------------------------------------------------------------- listings

def element_end(page, start):
    """Index just after the </div> closing the <div …> that starts at `start`."""
    depth = 0
    for match in re.finditer(r'<div\b|</div>', page[start:]):
        depth += 1 if match.group(0) == '<div' else -1
        if depth == 0:
            return start + match.end()
    raise ValueError('balise <div> non fermée')


def band_card(post, prefix, hidden=False):
    page = open(os.path.join(page_dir(post), 'index.html')).read()
    link = href(post, prefix)
    categories = categories_html(post, prefix, ' ')
    image = f' style="background-image: url(&quot;{prefix}{post["image"]}&quot;);"' if post['image'] else ''
    classes = ' '.join(['post_item post_item_container post_layout_band post_format_standard', f'post-{post.get("postId") or 0}',
                        'post type-post status-publish format-standard', 'has-post-thumbnail' if post['image'] else '', 'hentry'])
    return f'''<article id="post-{post.get("postId") or 0}" data-post-id="{post.get("postId") or 0}"{" hidden" if hidden else ""}
	class="{re.sub(' +', ' ', classes)}">
	<div class="post_featured with_thumb hover_dots post_featured_bg" data-ratio="1:1"><span class="post_thumb post_thumb_bg bg_in"{image}></span>						<div class="mask"></div>
									<a href="{link}"  aria-hidden="true" class="icons"><span></span><span></span><span></span></a>
			</div><div class="post_content_wrap">			<div class="post_header entry-header">
									<div class="post_category">
						<div class="post_meta"><span class="post_meta_item post_categories">{categories}</span></div>					</div>
					<h4 class="post_title entry-title"><a href="{link}" rel="bookmark">{texturize(post["title"])}</a></h4>			</div>
						<div class="post_content entry-content">
				<div class="post_content_inner">{excerpt(post, page)}</div>			</div>
			<div class="more-wrap"><a class="post-more-link" href="{link}"><span class="link-text">{LABELS[post["lang"]]["read_more"]}</span><span class="more-link-icon"></span></a></div>	</div>
</article>
'''


def pagination(lang, pages):
    labels = LABELS[lang]
    numbers = ''.join(f'<a href="#" class="page-numbers" data-page="{page}">{page}</a>' for page in range(2, min(pages, 5) + 1))
    more = (f'<a href="#" class="page-numbers next" data-page="2" title="{labels["next_page"]}">Next</a>'
            f'<a href="#" class="page-numbers last" data-page="{pages}" title="{labels["last_page"]}">Last</a>') if pages > 1 else ''
    return (f'<nav class="sc_blogger_pagination sc_item_pagination sc_item_pagination_advanced_pages navigation pagination  sc_align_none" '
            f'role="navigation" data-blog-pagination>\n\t\t\t<div class="nav-links"><span class="page-numbers current">1</span>{numbers}{more}</div>'
            f'<span class="page-numbers page-count">{labels["page_of"].format(page=1, pages=pages)}</span></nav>')


def views(post):
    value = str(post.get('views') or '0').strip()
    return float(value[:-1]) * 1000 if value.endswith('K') else float(value or 0)


def update_blog_page(lang, posts):
    """All the posts in one list; main.js shows them CARDS_PER_PAGE at a time (the theme loaded the
    other pages with Ajax, which the static site cannot do). As on WordPress, the French blog lists
    the newest posts first and the English blog the most viewed ones (`views`, newest first on a tie)."""
    if BLOG_ORDER[lang] == 'views':
        posts = sorted(posts, key=lambda post: (views(post), published(post)), reverse=True)
    file = os.path.join(ROOT, BLOG_PAGE[lang], 'index.html')
    page = open(file).read()
    prefix = '../../' if lang == 'en' else '../'
    # Posts after the first page are hidden in the HTML already, so their images are not downloaded
    cards = ''.join(band_card(post, prefix, index >= CARDS_PER_PAGE) for index, post in enumerate(posts))
    start = re.search(r'<div class="sc_blogger_content sc_item_content sc_item_posts_container posts_container band_wrap"[^>]*>', page).start()
    end = element_end(page, start)
    navigation = re.match(r'\s*<nav class="sc_blogger_pagination.*?</nav>', page[end:], re.S)
    end += navigation.end() if navigation else 0
    pages = max(1, math.ceil(len(posts) / CARDS_PER_PAGE))
    block = (f'<div class="sc_blogger_content sc_item_content sc_item_posts_container posts_container band_wrap" data-cards-per-page="{CARDS_PER_PAGE}">'
             f'{cards}</div>{pagination(lang, pages)}')
    open(file, 'w').write(page[:start] + block + page[end:])


def news_item(post, number, prefix):
    big = number == 1
    width, height = (890, 664) if big else (370, 370)
    image = crop(post['image'], width, height) if post['image'] else ''
    link = href(post, prefix)
    parity = 'odd' if number % 2 else 'even'
    kind = ('sc_blogger_item_default sc_blogger_item_default_classic' if big else 'sc_blogger_item_list sc_blogger_item_list_with_image')
    position = 'top' if big else 'left'
    size = 'attachment-qwery-thumb-square size-qwery-thumb-square' if big else 'attachment-trx_addons-thumb-avatar size-trx_addons-thumb-avatar'
    extra = ' sc_blogger_item_no_excerpt' if big else ''
    item_number = '' if big else f' data-item-number="{number}"'
    img = (f'<img loading="lazy" decoding="async" width="{width}" height="{height}" src="{prefix}{image}" class="{size} wp-post-image" alt="" />'
           if image else '')
    categories = categories_html(post, prefix, ', ')
    return (f'<div data-post-id="{post.get("postId") or 0}" data-item-number="{number}" class="sc_blogger_item sc_item_container post_container {kind} '
            f'sc_blogger_item_{parity} sc_blogger_item_align_none post_format_standard sc_blogger_item_with_image{extra} sc_blogger_item_image_position_{position} '
            f'post-{post.get("postId") or 0} post type-post status-publish format-standard has-post-thumbnail hentry" ><div class="sc_blogger_item_body">'
            f'<div class="post_featured with_thumb hover_link{"" if big else " default-featured-size"} sc_item_featured sc_blogger_item_featured"'
            f'{item_number}>{img}\t\t\t\t\t\t<div class="mask"></div>\n'
            f'\t\t\t\t\t\t\t\t\t<a href="{link}"  aria-hidden="true" class="link"></a>\n\t\t\t</div>'
            f'<div class="sc_blogger_item_content entry-content"><div class="post_meta sc_blogger_item_meta post_meta{"_categories" if big else ""}">'
            f'<span class="post_meta_item post_categories cat_sep">{categories}</span></div>'
            f'<h5 class="sc_blogger_item_title entry-title" data-item-number="{number}"><a href="{link}" rel="bookmark">{texturize(post["title"])}</a></h5>'
            f'<div class="sc_blogger_item_meta post_meta"><span class="post_meta_item post_date"><a href="{link}">{post["date"].replace("-", "/")}</a></span></div>'
            f'</div></div></div>')


def update_home(lang, posts):
    file = os.path.join(ROOT, HOME_PAGE[lang])
    page = open(file).read()
    prefix = '../' if lang == 'en' else ''
    chosen = [post for post in posts if post.get('home', True)][:HOME_NEWS]
    news = page.index('class="sc_blogger sc_blogger_news')
    start = page.index('<div class="sc_blogger_grid_wrap', news)
    end = element_end(page, start) - len('</div>')
    start = page.index('>', start) + 1
    items = ''.join(news_item(post, number, prefix) for number, post in enumerate(chosen, 1))
    open(file, 'w').write(page[:start] + items + page[end:])


# ---------------------------------------------------------------- tidy

REDIRECT = """<!doctype html>
<html lang="{lang}" data-blog-redirect>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, follow">
<title>Redirection</title>
<link rel="canonical" href="{site}/{target}">
<meta http-equiv="refresh" content="0; url={prefix}{target}">
<script>location.replace('{prefix}{target}')</script>
</head>
<body><p><a href="{prefix}{target}">{site}/{target}</a></p></body>
</html>
"""


def tidy(posts):
    """Unpublished posts: their page becomes a redirect to the blog (the address keeps working).
    Pages created from the template whose post was deleted or renamed are removed."""
    live = {lang: {post['slug'] for post in posts[lang]} for lang in LANGS}
    changed = []
    for post in DRAFTS:
        file = os.path.join(page_dir(post), 'index.html')
        if os.path.exists(file):
            prefix = '../../' if post['lang'] == 'en' else '../'
            open(file, 'w').write(REDIRECT.format(lang=post['lang'], site=SITE, target=BLOG_PAGE[post['lang']] + '/', prefix=prefix))
            changed.append(os.path.relpath(file, ROOT))
    drafts = {(post['lang'], post['slug']) for post in DRAFTS}
    for lang in LANGS:
        base = os.path.join(ROOT, 'en') if lang == 'en' else ROOT
        for name in os.listdir(base):
            file = os.path.join(base, name, 'index.html')
            if name in live[lang] or (lang, name) in drafts or not os.path.isfile(file):
                continue
            with open(file) as handle:
                head = handle.read(300)
            if 'data-blog-generated' in head:
                shutil.rmtree(os.path.join(base, name))
                changed.append(os.path.relpath(os.path.join(base, name), ROOT))
    return changed


def build():
    posts = load_posts()
    removed = tidy(posts)
    all_slugs = {lang: {post['slug'] for post in posts[lang]} for lang in LANGS}
    written, created = [], []
    for lang in LANGS:
        tags = tag_slugs(lang)
        items = posts[lang]
        for index, post in enumerate(items):
            older = items[index + 1] if index + 1 < len(items) else None
            newer = items[index - 1] if index > 0 else None
            path, new = render_post(post, older, newer, tags, all_slugs)
            written.append(path)
            if new:
                created.append(path)
        update_blog_page(lang, items)
        update_home(lang, items)
    return written, created, removed


if __name__ == '__main__':
    written, created, removed = build()
    print(f'{len(written)} articles, {len(created)} créés, {len(removed)} retirés; blog et accueil FR/EN à jour')
    for path in created:
        print('  +', path)
    for path in removed:
        print('  -', path)
    sys.exit(0)
