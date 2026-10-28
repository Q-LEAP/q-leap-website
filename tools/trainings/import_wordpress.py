"""Import ponctuel des formations WordPress vers content/trainings.json (28/10/2026).

Sources, toutes relevées en lecture seule (WordPress n'est plus modifié) :
- tools/trainings/import/trx.json : boîte « Item Options » ThemeREX de chaque formation
  (price, infos, duration, languages, delivery_format, certificate_diploma, upload_*_pdf, add_contact_form)
- tools/trainings/import/acf.json : groupe ACF « Training options » (filtres du catalogue) + image à la une
- tools/trainings/import/media.json : URL des images à la une (API publique)
- les pages exportées trainings/*/ et en/trainings/*/ : titres, sessions, lien vers la traduction

Après cet import, content/trainings.json est la seule source : il se modifie avec l'éditeur
(tools/trainings/editor) et les pages sont générées par tools/trainings/build.mjs.
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'export'))
import export  # noqa: E402  (réutilise le téléchargement des images Photon recadrées)

IMPORT = os.path.join(HERE, 'import')
trx = json.load(open(os.path.join(IMPORT, 'trx.json')))
acf = json.load(open(os.path.join(IMPORT, 'acf.json')))
media = json.load(open(os.path.join(IMPORT, 'media.json')))
sessions = json.load(open(os.path.join(IMPORT, 'sessions.json')))
FR_ORDER = [40378, 38345, 23713, 24720, 24716, 24649, 24645, 24634, 23597, 23595, 23251]  # catalogue order (date desc)
CARD_IMAGE_FALLBACK = {  # images à la une non publiques dans l'API : URL relevée sur le catalogue
    '36336': 'https://i0.wp.com/q-leap.eu/wp-content/uploads/2024/09/steve-johnson-_0iV9LmPDn0-unsplash-scaled.jpg',
    '36337': 'https://i0.wp.com/q-leap.eu/wp-content/uploads/2024/09/steve-johnson-_0iV9LmPDn0-unsplash-scaled.jpg',
}


def page_of(lang, slug):
    return os.path.join(ROOT, 'en' if lang == 'en' else '', 'trainings', slug, 'index.html')


def read_page(lang, slug):
    markup = open(page_of(lang, slug)).read()
    title = html.unescape(re.search(r'<h1 class="sc_layouts_title_caption">(.*?)</h1>', markup, re.S).group(1)).strip()
    seo_title = html.unescape(re.search(r'<title>(.*?)</title>', markup, re.S).group(1)).strip()
    other = 'fr' if lang == 'en' else 'en'
    link = re.search(r'<a href="([^"]*)"[^>]*>(?:(?!</a>).){0,300}lang="' + other + '"', markup, re.S)
    translation = link.group(1).rstrip('/').split('/')[-1] if link else None
    post_id = re.search(r'<article id="post-(\d+)"', markup).group(1)
    taxonomy = re.search(r'<article id="post-\d+"[^>]*class="[^"]*?((?:taxonomy_training-\S+\s*)+)"', markup)
    modified = (re.search(r'article:modified_time" content="([^"]+)"', markup) or [0, ''])[1]
    return {'title': title, 'seoTitle': seo_title, 'translation': translation, 'postId': post_id,
            'taxonomyClasses': taxonomy.group(1).split() if taxonomy else [], 'modified': modified}


CARDS = {}
for name in ('training_', 'training_2_', 'en_training_', 'en_training_2_'):
    for card in json.load(open(os.path.join(IMPORT, f'cards-{name}.json'))):
        CARDS[card['post']] = card


def card_image(post_id):
    """The catalogue card image exactly as WordPress served it (size chosen from the attachment)."""
    card = CARDS[str(post_id)]
    srcset = []
    for candidate in html.unescape(card['srcset'] or '').split(','):
        bits = candidate.strip().split()
        if len(bits) == 2:
            srcset.append([export.local_asset(bits[0], 'images'), bits[1]])
    return {'src': export.local_asset(html.unescape(card['src']), 'images'), 'srcset': srcset,
            'sizes': card['sizes'], 'width': int(card['width']), 'height': int(card['height'])}


def image_for(post_id):
    featured = str(acf[post_id]['__featured'])
    source = media.get(featured, {}).get('url') or CARD_IMAGE_FALLBACK[featured]
    path = source.split('/wp-content/uploads/')[1]
    social = export.local_asset(f'https://i0.wp.com/q-leap.eu/wp-content/uploads/{path}', 'images')
    return {'card': card_image(post_id), 'social': social, 'socialUrl': f'https://i0.wp.com/q-leap.eu/wp-content/uploads/{path}?fit=850%2C600&ssl=1'}


MONTHS = {name: index + 1 for names in (
    ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])
    for index, name in enumerate(names)}


def end_date(start, text):
    """« 8 décembre - 10 décembre 2026 » → 2026-12-10 (the year of the start date when the range omits it)."""
    match = re.search(r'-\s*(\d{1,2})\s+([^\s\d]+)(?:\s+(\d{4}))?\s*$', text.strip())
    if not match:
        return start
    year = int(match.group(3) or start[:4])
    return f'{year:04d}-{MONTHS[match.group(2).lower()]:02d}-{int(match.group(1)):02d}'


def sessions_for(lang, slug):
    key = ('en/' if lang == 'en' else '') + f'trainings/{slug}/index.html'
    result = []
    for item in sessions.get(key, []):
        meta = {entry['label'].rstrip(':').strip().lower(): entry['value'] for entry in item['meta']}
        start = item['start'][:10]
        result.append({'start': start, 'end': end_date(start, item['range']), 'language': meta.get('langue', meta.get('language', '')),
                       'format': meta.get('format', ''), 'eventId': item['event_id']})
    return result


def document(url):
    """PDFs are copied into the site (assets/documents/...) so it no longer depends on WordPress."""
    url = url.strip()
    return export.local_asset(url, 'documents') if url else ''


def version(lang, post_id, slug):
    fields = trx[post_id]
    page = read_page(lang, slug)
    filters = {name: acf[post_id][name]['value'] for name in ('theme', 'niveau', 'format', 'certification', 'language')}
    return {
        'postId': int(post_id),
        'slug': slug,
        # Raw WordPress title (« - », « ' »…): the pages apply WordPress' texturize when they print it.
        'title': json.loads('"' + fields['__title'] + '"') if fields.get('__title') else page['title'],
        'seoTitle': page['seoTitle'],
        'published': fields.get('__date', '')[:19],
        'modified': page['modified'],
        'description': (fields.get('infos_tinymce') or fields.get('infos') or '').strip(),
        'price': fields.get('price', '').strip(),
        'duration': fields.get('duration', '').strip(),
        'languages': fields.get('languages', '').strip(),
        'format': fields.get('delivery_format', '').strip(),
        'certificate': fields.get('certificate_diploma', '').strip(),
        'programPdf': document(fields.get('upload_programm_pdf', '')),
        'syllabusPdf': document(fields.get('upload_syllabus_pdf', '')),
        'contactForm': fields.get('add_contact_form', '').strip(),
        'taxonomyClasses': page['taxonomyClasses'],
        'filters': filters,
        'sessions': sessions_for(lang, slug),
    }, page['translation']


def slug_of(post_id, lang):
    for path in [p for p in os.listdir(os.path.join(ROOT, 'en' if lang == 'en' else '', 'trainings'))]:
        markup_path = page_of(lang, path)
        if os.path.exists(markup_path) and f'<article id="post-{post_id}"' in open(markup_path).read():
            return path
    raise SystemExit(f'page introuvable pour {lang} #{post_id}')


trainings = []
for order, post_id in enumerate(FR_ORDER):
    fr_slug = slug_of(post_id, 'fr')
    fr, en_slug = version('fr', str(post_id), fr_slug)
    en_page = read_page('en', en_slug)
    en, _ = version('en', en_page['postId'], en_slug)
    trainings.append({'id': fr_slug, 'order': order, 'status': 'published', 'image': image_for(str(post_id)),
                      'imageEn': image_for(en_page['postId']), 'fr': fr, 'en': en})

content = {
    '$comment': 'Formations du site q-leap.eu. Se modifie avec l’éditeur (npm run trainings, dossier tools/trainings). Importé de WordPress le 28/10/2026.',
    'filters': {
        'theme': {'fr': 'Thème', 'en': 'Theme', 'choices': acf['23713']['theme']['choices']},
        'niveau': {'fr': 'Niveau', 'en': 'Level', 'choices': acf['23713']['niveau']['choices']},
        'format': {'fr': 'Format', 'en': 'Format', 'choices': acf['23713']['format']['choices']},
        'certification': {'fr': 'Certification', 'en': 'Certification', 'choices': acf['23713']['certification']['choices']},
        'language': {'fr': 'Langue', 'en': 'Language', 'choices': acf['23713']['language']['choices']},
    },
    'trainings': trainings,
}
os.makedirs(os.path.join(ROOT, 'content'), exist_ok=True)
json.dump(content, open(os.path.join(ROOT, 'content', 'trainings.json'), 'w'), ensure_ascii=False, indent=2)
print(len(trainings), 'formations importées')
