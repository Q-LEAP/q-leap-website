"""Inventaire des contenus WordPress de q-leap.eu et proposition de tri (garder / désactiver / supprimer).

Entrées (relevées le 28/10/2026, voir tools/inventory/data/) :
- pages.tsv : liste de l'administration (id, titre, slug, statut, langue)
- posts_fr.json, posts_en.json, trainings_fr.json, trainings_en.json : API publique WordPress
- crawl.jsonl : chaque URL publique (statut, mots, lorem ipsum, liens entrants hors menu/pied de page)

Sorties : docs/page-inventory.md et tools/inventory/index.html (page de revue, non publiée).
"""
import collections
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(HERE, 'data')
SITE = 'https://q-leap.eu'

KEEP, DISABLE, DELETE = 'Garder', 'Désactiver', 'Supprimer'


def load_crawl():
    rows = []
    for name in ('crawl.jsonl', 'crawl_en.jsonl'):
        path = os.path.join(DATA, name)
        if os.path.exists(path):
            rows += [json.loads(line) for line in open(path) if line.strip()]
    ok = [row for row in rows if row.get('status') == 200]
    counts = collections.Counter(link for row in ok for link in set(row.get('links', [])))
    global_links = {link for link, count in counts.items() if count > 0.6 * len(ok)}
    inbound = collections.Counter(link for row in ok for link in set(row['links']) - global_links)
    by_url = {}
    for row in rows:
        url = row['url'].rstrip('/') + '/'
        by_url.setdefault(url, row)
    return by_url, inbound, global_links


CRAWL, INBOUND, NAV = load_crawl()


def signals(url):
    url = url.rstrip('/') + '/'
    row = CRAWL.get(url, {})
    return {'words': row.get('words'), 'inbound': INBOUND.get(url, 0), 'nav': url in NAV, 'lorem': row.get('lorem', 0)}


items = []


def add(kind, lang, title, url, decision, reason, redirect='', item_id='', date=''):
    items.append({'kind': kind, 'lang': lang, 'title': html.unescape(title), 'url': url, 'decision': decision,
                  'reason': reason, 'redirect': redirect, 'id': str(item_id), 'date': date, **signals(url)})


# Pages ------------------------------------------------------------------------------------------
MENU_PAGES = {'tests-logiciel', 'about-us', 'our-events', 'our-references', 'blog', 'testing-service', 'automatisation-des-tests',
              'test-performance-testing', 'tests-daccessibilite', 'test-dexperience-utilisateur-ux', 'tests-uat-user-acceptance-testing',
              'innovations', 'training', 'calendrier-formation', 'istqb-exam-practice-test', 'join-us', 'contact',
              'testing', 'test-automation', 'performance-testing', 'accessibility-testing', 'user-experience-ux-testing',
              'uat-user-acceptance-testing', 'training-calendar', 'career', 'references'}
PAGE_RULES = {
    'data-protection-notice': (KEEP, 'Politique de confidentialité (pied de page, obligatoire)'),
    'privacy-policy': (KEEP, 'Privacy policy (footer, required)'),
    'bookmarklets-test-daccessibilite': (KEEP, 'Contenu réel, lié depuis les pages accessibilité'),
    'bookmarklets-for-accessibility-testing': (KEEP, 'Contenu réel, lié depuis les pages accessibilité'),
    'q-leap-factory': (KEEP, 'Offre « Services de tests à la demande », liée depuis 2 pages'),
    'about-us-2': (DISABLE, 'Ancienne version « About us » (2023), doublon de « À propos »', 'about-us/'),
    'actualites': (DISABLE, 'Doublon de « Blog » (même liste d’articles)', 'blog/'),
    'news': (DISABLE, 'Doublon de « Blog » (même liste d’articles)', 'en/blog/'),
    'quiz-istqb-foundation': (DISABLE, 'Page quiz isolée ; le quiz est sur Training et Examen blanc', 'istqb-exam-practice-test/'),
    'istqb-foundation-quiz': (DELETE, 'Ne répond plus (redirigée vers l’accueil)', ''),
    'faq-2': (DELETE, 'Contenu de démo du thème (faux latin « Dicta sunt explicabo »)', ''),
    'faq': (DELETE, 'Contenu de démo du thème (faux latin)', ''),
    'editeur-de-traduction-classique': (DELETE, 'Page technique créée par WPML, sans contenu', ''),
    'classic-translation-editor': (DELETE, 'Page technique créée par WPML, sans contenu', ''),
    'search': (DELETE, 'Page « Search » du thème (2020), inutile en statique', ''),
}
for line in open(os.path.join(DATA, 'pages.tsv')):
    fields = line.rstrip('\n').split('\t')
    if len(fields) < 9:
        continue
    page_id, title, slug, status, lang = fields[0], fields[1], fields[2], fields[3], fields[8] or 'en'
    if page_id == '5002':
        add('Page', 'fr', 'Accueil', SITE + '/', KEEP, 'Page d’accueil', item_id=page_id)
        continue
    if page_id == '32486':
        add('Page', 'en', 'Home', SITE + '/en/', KEEP, 'Homepage', item_id=page_id)
        continue
    url = f'{SITE}/{"en/" if lang == "en" else ""}{slug}/'
    if slug == 'home-home-page':
        add('Page', lang, title, url, DELETE, 'Doublon de démo de l’accueil (« HOME – Home Page »)', item_id=page_id)
    elif slug in PAGE_RULES:
        decision, reason, *redirect = PAGE_RULES[slug]
        target = redirect[0] if redirect else ''
        if lang == 'en' and target and not target.startswith('en/'):
            target = 'en/' + {'about-us/': 'about-us/', 'istqb-exam-practice-test/': 'istqb-exam-practice-test/'}.get(target, target)
        add('Page', lang, title, url, decision, reason, target, page_id)
    elif slug in MENU_PAGES:
        add('Page', lang, title, url, KEEP, 'Dans le menu principal', item_id=page_id)
    else:
        add('Page', lang, title, url, KEEP, 'Page publiée, à confirmer', item_id=page_id)

# Posts ------------------------------------------------------------------------------------------
EVERGREEN = re.compile(r'dette de processus|cycle de développement|anti-pattern|construite|qualité et l.innovation|gestion de la qualité|'
                       r'sous tous les angles|mise à l.échelle de DevOps|sélection de tests|grandes tendances|smart contracts|mesure de l.UX|'
                       r'formation comme moyen|automatisation des tests et l.UX|double authentification|ISTQB Foundation 4\.0|'
                       r'Règlementation|Modalités pratiques|Practical details|process debt|development cycle|built in|'
                       r'quality and innovation|quality management|from all angles|from every angle|scaling DevOps|not tested but built|test selection|major trends|testing trends|'
                       r'smart contract|measuring UX|UX measurement|automation and UX|training as a|two-factor|double authentication|ISTQB Foundation 4|regulation|'
                       r'accessibility', re.I)
seen_titles = {}
french_decision_by_date = {}
for lang in ('fr', 'en'):
    posts = json.load(open(os.path.join(DATA, f'posts_{lang}.json')))
    for post in sorted(posts, key=lambda p: p['date']):
        title = html.unescape(post['title']['rendered'])
        year = int(post['date'][:4])
        key = (lang, re.sub(r'\W+', '', title.lower()))
        if key in seen_titles:
            add('Article', lang, title, post['link'], DELETE, f'Doublon de l’article #{seen_titles[key]} (même titre)', 'blog/' if lang == 'fr' else 'en/blog/', post['id'], post['date'][:10])
            continue
        seen_titles[key] = post['id']
        paired = french_decision_by_date.get(post['date'][:10]) if lang == 'en' else None
        if paired:
            decision, reason = paired
            add('Article', lang, title, post['link'], decision, reason + ' (comme la version française)', 'en/blog/' if decision == DISABLE else '', post['id'], post['date'][:10])
            continue
        if year >= 2023:
            add('Article', lang, title, post['link'], KEEP, 'Actualité récente (2023 et après)', item_id=post['id'], date=post['date'][:10])
        elif EVERGREEN.search(title):
            add('Article', lang, title, post['link'], KEEP, 'Article de fond, toujours d’actualité (référencement)', item_id=post['id'], date=post['date'][:10])
        else:
            add('Article', lang, title, post['link'], DISABLE, f'Actualité datée ({year}) : événement passé, arrivée, vœux…', 'blog/' if lang == 'fr' else 'en/blog/', post['id'], post['date'][:10])

        if lang == 'fr':
            french_decision_by_date[post['date'][:10]] = (items[-1]['decision'], items[-1]['reason'])

# Trainings ----------------------------------------------------------------------------------------
for lang in ('fr', 'en'):
    for training in json.load(open(os.path.join(DATA, f'trainings_{lang}.json'))):
        add('Formation', lang, html.unescape(training['title']['rendered']), training['link'], KEEP, 'Formation publiée au catalogue', item_id=training['id'], date=training['modified'][:10])
add('Formation', 'fr+en', '40 formations en brouillon', '', DELETE, 'Brouillons jamais publiés (à vérifier dans l’admin avant suppression)')

# Jobs -----------------------------------------------------------------------------------------------
OPEN_JOBS = {'analyste-test-m-f', 'candidature-spontanee', 'expert-en-automatisation-de-test', 'technical-test-consultant-e-experimente-e-m-f',
             'test-consultant-junior-m-f-2', 'test-consultant-junior-m-f-adem-24-09-2026', 'test-environnement-manager-m-f'}
job_urls = sorted({row['url'] for row in CRAWL.values() if row['type'] == 'awsm_job_openings'} | {SITE + '/jobs/candidature-spontanee/'})
for url in job_urls:
    slug = url.rstrip('/').split('/')[-1]
    row = CRAWL.get(url.rstrip('/') + '/', {})
    title = (row.get('title') or slug).replace(' - Q-Leap', '')
    if slug in OPEN_JOBS:
        add('Offre d’emploi', 'fr', title, url, KEEP, 'Affichée sur la page Carrière', item_id='', date=row.get('lastmod', ''))
    elif row.get('status') != 200 or not row.get('words'):
        add('Offre d’emploi', 'fr', title, url, DELETE, 'Ne répond plus (poste pourvu)', 'join-us/')
    else:
        add('Offre d’emploi', 'en' if '/en/' in url else 'fr', title, url, DISABLE, 'N’est plus affichée sur la page Carrière (poste pourvu ?)', 'join-us/' if '/en/' not in url else 'en/career/', date=row.get('lastmod', ''))

# Portfolio / references -------------------------------------------------------------------------
for url in sorted({row['url'] for row in CRAWL.values() if row['type'] == 'cpt_portfolio'}):
    row = CRAWL[url.rstrip('/') + '/']
    title = row.get('title', '').replace(' - Q-Leap', '')
    if url.rstrip('/').endswith('/portfolio'):
        add('Référence client', 'fr', title, url, DISABLE, 'Archive du thème, doublon de la page Références', 'our-references/')
    else:
        add('Référence client', 'fr', title, url, KEEP, 'Étude de cas liée depuis Références et les pages services', date=row.get('lastmod', ''))

# Theme demo content -------------------------------------------------------------------------------
demo = sorted({row['url'] for row in CRAWL.values() if row['type'] == 'cpt_services'})
add('Démo du thème', 'fr+en', f'{len(demo)} « Services » de démonstration (Photography, Art Design, Free Wi-Fi…)', SITE + '/services/', DELETE,
    'Contenu de démo Qwery en lorem ipsum, jamais personnalisé')
add('Sessions du calendrier', 'fr+en', '457 sessions de formation (Events Calendar)', SITE + '/sessions/', KEEP,
    'Ne pas migrer les sessions passées ; les sessions à venir deviennent des données du calendrier statique')

counts = collections.Counter((item['kind'], item['decision']) for item in items)
summary = collections.Counter(item['decision'] for item in items)

# Markdown -----------------------------------------------------------------------------------------
lines = ['# Inventaire des contenus et proposition de tri', '',
         'Relevé le 28/10/2026 sur q-leap.eu (administration WordPress, API publique et analyse de chaque URL).',
         'Proposition à valider : rien n’est supprimé sur WordPress, le tri décide de ce qui est reproduit sur le site statique.', '',
         '- **Garder** : reproduit à l’identique sur le site statique.',
         '- **Désactiver** : pas reproduit ; l’ancienne adresse redirige (301) vers la page indiquée.',
         '- **Supprimer** : pas reproduit, pas de redirection utile (démo, doublon, page technique).', '',
         '| Type | Garder | Désactiver | Supprimer |', '|---|---|---|---|']
for kind in dict.fromkeys(item['kind'] for item in items):
    lines.append(f'| {kind} | {counts[(kind, KEEP)]} | {counts[(kind, DISABLE)]} | {counts[(kind, DELETE)]} |')
for decision in (KEEP, DISABLE, DELETE):
    lines += ['', f'## {decision} ({summary[decision]})', '', '| Type | Langue | Titre | Adresse | Raison | Redirection |', '|---|---|---|---|---|---|']
    for item in items:
        if item['decision'] == decision:
            path = item['url'].replace(SITE, '') or '—'
            lines.append(f"| {item['kind']} | {item['lang']} | {item['title'].replace('|', '/')} | {path} | {item['reason']} | {('/' + item['redirect']) if item['redirect'] else ''} |")
open(os.path.join(ROOT, 'docs', 'page-inventory.md'), 'w').write('\n'.join(lines) + '\n')
json.dump(items, open(os.path.join(HERE, 'inventory.json'), 'w'), ensure_ascii=False, indent=1)
print({k: v for k, v in summary.items()}, len(items), 'lignes')
