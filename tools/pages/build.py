#!/usr/bin/env python3
"""Standalone content pages (no WordPress counterpart): content/pages/<lang>/<slug>.json → <slug>/index.html
(FR) or en/<slug>/index.html (EN).

Each page reuses the blog post template (tools/blog/templates/post.<lang>.html: same header, menus, footer,
fonts and styles as the rest of the site) without what makes it a blog post: no categories, date, views,
featured image, tags, related posts, previous/next links or blog sidebar. The JSON holds:
  title        visible H1
  seoTitle     <title> and og:title
  description  meta description source (copied into content/seo/descriptions.json) and og:description
  body         the page content, HTML
  translation  slug of the same page in the other language ('' if none)

Run before tools/search/build.py, tools/seo/descriptions.py and tools/seo/alternates.py (the Build content
workflow order), so the page gets its sitemap entry, meta description and hreflang like every other page.
Usage: python3 tools/pages/build.py
"""
import glob
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = 'https://q-leap.eu'
TEMPLATE = os.path.join(ROOT, 'tools', 'blog', 'templates', 'post.{lang}.html')
TEMPLATE_SLUG = {'fr': 'quand-les-testeurs-font-face-a-la-dette-de-processus', 'en': 'when-testers-face-process-debt'}
DESCRIPTIONS = os.path.join(ROOT, 'content', 'seo', 'descriptions.json')


def attribute(text):
    return html.escape(text, quote=True)


def page_url(lang, slug):
    return f"{SITE}/{'en/' if lang == 'en' else ''}{slug}/"


def json_ld(page, lang, url, graph_source):
    """Keep the template's WebSite and Organization nodes, replace the post's nodes by one WebPage."""
    graph = json.loads(graph_source)
    kept = [node for node in graph['@graph'] if node.get('@type') in ('WebSite', 'Organization')]
    webpage = {
        '@type': 'WebPage', '@id': url, 'url': url, 'name': page['seoTitle'], 'description': page['description'],
        'isPartOf': {'@id': f'{SITE}/#website'}, 'about': {'@id': f'{SITE}/#organization'},
        'inLanguage': 'en-US' if lang == 'en' else 'fr-FR',
        'breadcrumb': {'@id': f'{url}#breadcrumb'},
    }
    breadcrumb = {
        '@type': 'BreadcrumbList', '@id': f'{url}#breadcrumb',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home' if lang == 'en' else 'Accueil', 'item': f"{SITE}/{'en/' if lang == 'en' else ''}"},
            {'@type': 'ListItem', 'position': 2, 'name': page['title']},
        ],
    }
    graph['@graph'] = [webpage, breadcrumb] + kept
    return json.dumps(graph, ensure_ascii=False, separators=(',', ':')).replace('/', '\\/')


def render(page, lang, slug):
    source = open(TEMPLATE.format(lang=lang), encoding='utf-8').read()
    url = page_url(lang, slug)
    markup = source.replace(f'/{TEMPLATE_SLUG[lang]}/', f'/{slug}/')
    markup = markup.replace('<html ', '<html data-page-generated ', 1)
    # static.css (not in the blog template): wide-table scrolling and other rules of the static site.
    markup = markup.replace('</head>', f'<link rel="stylesheet" id="ql-static-css" href="{"../../" if lang == "en" else "../"}assets/css/static.css">\n</head>', 1)
    markup = re.sub(r'<title>.*?</title>', f'<title>{html.escape(page["seoTitle"])}</title>', markup, count=1, flags=re.S)
    # Social tags: this page's title, description and type; the post's image and article dates go.
    markup = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + attribute(page['seoTitle']), markup)
    markup = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + attribute(page['description']), markup)
    markup = re.sub(r'(<meta property="og:type" content=")article', r'\1website', markup)
    markup = re.sub(r'\s*<meta (?:property|name)="(?:og:image[^"]*|article:[^"]*|twitter:(?:label|data)\d)"[^>]*>', '', markup)
    # The post's FR/EN alternates point at the template's pair; tools/seo/alternates.py writes the page's own.
    markup = re.sub(r'\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*" />', '', markup)
    markup = re.sub(r'(<script type="application/ld\+json" class="yoast-schema-graph">)(.*?)(</script>)',
                    lambda m: m.group(1) + json_ld(page, lang, url, m.group(2)) + m.group(3), markup, count=1, flags=re.S)
    # Page layout: body classes of a page without sidebar.
    markup = re.sub(r'<body class="([^"]*)"', lambda m: '<body class="' + re.sub(r'\bsidebar_show sidebar_right\b', 'sidebar_hide', m.group(1))
                    .replace('single-post', 'page').replace('blog_mode_post', 'blog_mode_page') + '"', markup, count=1)
    article = (f'<article class="post_item_single post_type_page type-page status-publish hentry ql-content-page">\n'
               f'\t\t\t<div class="post_header_wrap post_header_wrap_in_content post_header_wrap_style_style-6">\n'
               f'\t\t\t\t<div class="post_header post_header_single entry-header"><h1 class="post_title entry-title">{html.escape(page["title"])}</h1></div>\n'
               f'\t\t\t</div>\n'
               f'\t\t\t<div class="post_content post_content_single entry-content">\n{page["body"]}\n\t\t\t</div>\n'
               f'\t\t</article>')
    markup = re.sub(r'<article id="post-\d+".*?</article>', lambda m: article, markup, count=1, flags=re.S)
    markup = re.sub(r'\s*<div class="sidebar widget_area.*?(?=\s*<div class="clearfix"></div>)', '', markup, count=1, flags=re.S)
    return markup


def main():
    descriptions = json.load(open(DESCRIPTIONS, encoding='utf-8'))
    written = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'content', 'pages', '*', '*.json'))):
        lang = os.path.basename(os.path.dirname(path))
        slug = os.path.splitext(os.path.basename(path))[0]
        page = json.load(open(path, encoding='utf-8'))
        target = os.path.join(ROOT, 'en' if lang == 'en' else '', slug, 'index.html')
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'w', encoding='utf-8') as handle:
            handle.write(render(page, lang, slug))
        descriptions[f"{'en/' if lang == 'en' else ''}{slug}/"] = page['description']
        written.append(os.path.relpath(target, ROOT))
    with open(DESCRIPTIONS, 'w', encoding='utf-8') as handle:
        handle.write(json.dumps(descriptions, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(written)} pages')
    for item in written:
        print('  ' + item)


if __name__ == '__main__':
    main()
