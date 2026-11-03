"""Crée les gabarits de fiche formation (tools/trainings/templates/training.{fr,en}.html) à partir de
la fiche « ISTQB Foundation » exportée de WordPress : tout le balisage d'origine (en-tête, menus,
pied de page, popups) est conservé ; ce qui dépend de la formation devient un emplacement {{…}}
rempli par build.mjs. À relancer seulement si l'habillage commun des fiches change.
"""
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
base = json.load(open(os.path.join(ROOT, 'content', 'trainings', 'istqb-certified-tester-foundation-level.json')))


def must_replace(markup, old, new, count=None, regex=False):
    found = len(re.findall(old, markup, re.S)) if regex else markup.count(old)
    if not found or (count is not None and found != count):
        raise SystemExit(f'gabarit : « {old[:80]} » trouvé {found} fois (attendu {count or "≥ 1"})')
    return re.sub(old, lambda _: new, markup, flags=re.S) if regex else markup.replace(old, new)


for lang in ('fr', 'en'):
    data = base[lang]
    path = os.path.join(ROOT, 'en' if lang == 'en' else '', 'trainings', data['slug'], 'index.html')
    markup = open(path).read()
    url = f"https://q-leap.eu/{'en/' if lang == 'en' else ''}trainings/{data['slug']}/"
    title_html = re.search(r'<h1 class="sc_layouts_title_caption">(.*?)</h1>', markup, re.S).group(1)
    json_ld = re.search(r'<script type="application/ld\+json" class="yoast-schema-graph">(.*?)</script>', markup, re.S).group(1)
    os.makedirs(os.path.join(HERE, 'templates'), exist_ok=True)
    open(os.path.join(HERE, 'templates', f'jsonld.{lang}.json'), 'w').write(json_ld)
    markup = must_replace(markup, r'<script type="application/ld\+json" class="yoast-schema-graph">.*?</script>',
                          '<script type="application/ld+json" class="yoast-schema-graph">{{{jsonLd}}}</script>', 1, regex=True)
    markup = must_replace(markup, r'<title>.*?</title>', '<title>{{seoTitle}}</title>', 1, regex=True)
    markup = must_replace(markup, r'<link rel="canonical" href="[^"]*" />', '<link rel="canonical" href="{{url}}" />', 1, regex=True)
    markup = must_replace(markup, r'<meta property="og:title" content="[^"]*" />', '<meta property="og:title" content="{{seoTitle}}" />', regex=True)
    markup = must_replace(markup, f'content="{url}"', 'content="{{url}}"')
    markup = must_replace(markup, r'<meta property="article:modified_time" content="[^"]*" />', '<meta property="article:modified_time" content="{{modified}}" />', 1, regex=True)
    markup = must_replace(markup, r'<meta property="og:image" content="[^"]*"\s*/>', '<meta property="og:image" content="{{socialImageUrl}}" />', regex=True)
    markup = must_replace(markup, f'postid-{data["postId"]}', 'postid-{{postId}}', 1)
    markup = must_replace(markup, r'<article id="post-\d+".*?</article>', '{{{article}}}', 1, regex=True)
    markup = must_replace(markup, f'<span class="breadcrumbs_item current">{title_html}</span>', '<span class="breadcrumbs_item current">{{{breadcrumbTitle}}}</span>', 1)
    markup = must_replace(markup, title_html, '{{{titleHtml}}}')
    other = 'fr' if lang == 'en' else 'en'
    translation_href = re.search(r'<a href="([^"]*)"[^>]*>(?:(?!</a>).){0,300}lang="' + other + '"', markup, re.S).group(1)
    markup = must_replace(markup, f'href="{translation_href}"', 'href="{{translationHref}}"')
    markup = must_replace(markup, f"value='{url}'", "value='{{url}}'")
    self_href = ('../../../' if lang == 'en' else '../../') + ('en/' if lang == 'en' else '') + f"trainings/{data['slug']}/"
    markup = must_replace(markup, f'href="{self_href}"', 'href="{{selfHref}}"')
    markup = must_replace(markup, f'elementor-page-{data["postId"]}', 'elementor-page-{{postId}}', 1)
    leftovers = [token for token in (data['slug'], str(data['postId'])) if token in markup]
    if leftovers:
        raise SystemExit(f'gabarit {lang} : il reste {leftovers}')
    os.makedirs(os.path.join(HERE, 'templates'), exist_ok=True)
    open(os.path.join(HERE, 'templates', f'training.{lang}.html'), 'w').write(markup)
    print(lang, 'gabarit écrit', len(markup), 'octets')
