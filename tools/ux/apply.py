"""UXEnhance: adds the usability layer to the pages (idempotent, run after any page generation).

- assets/css/ux.css and assets/js/ux.js on every page (after the other styles and scripts);
- a "Contact" button in the desktop header, next to the search icon;
- the catalogue request on Formations as a real e-mail button.
The look comes from the theme itself: its button classes (sc_button) and colour variables.
Usage: python3 tools/ux/apply.py"""
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXT = {
    'fr': {'contact': 'Nous contacter', 'contact_href': 'contact/'},
    'en': {'contact': 'Contact us', 'contact_href': 'en/contact/'},
}


def pages():
    files = subprocess.run(['git', 'ls-files', '-z', '-co', '--exclude-standard', '*.html'], cwd=ROOT, capture_output=True, text=True).stdout.split('\0')
    templates = ['tools/blog/templates/post.fr.html', 'tools/blog/templates/post.en.html',
                 'tools/trainings/templates/training.fr.html', 'tools/trainings/templates/training.en.html']
    return [file for file in files if file and not file.startswith(('tools/', 'docs/'))] + templates


def prefix_for(file):
    if file.startswith('tools/'):  # templates: their pages live at <slug>/ or en/<slug>/ (trainings one level deeper)
        depth = 1 + file.endswith('.en.html') + ('/trainings/' in file)
        return '../' * depth
    return '../' * file.count('/')


def add_assets(markup, prefix):
    if 'assets/css/ux.css' not in markup:
        markup = markup.replace('</head>', f'<link rel="stylesheet" href="{prefix}assets/css/ux.css">\n</head>', 1)
    if 'assets/js/ux.js' not in markup and 'assets/js/main.js' in markup:
        markup = re.sub(r'(<script src="[^"]*assets/js/main\.js" defer></script>)',
                        lambda m: m.group(1) + f'\n<script src="{prefix}assets/js/ux.js" defer></script>', markup, count=1)
    return markup


def header_cta(markup, prefix, text):
    markup = re.sub(r'<a class="[^"]*ql-header-cta"[^>]*>.*?</a>(?=<div class="sc_layouts_search">)', '', markup, flags=re.S)
    header = re.search(r'<header\b.*?</header>', markup, re.S)
    if not header:
        return markup
    button = f'<a class="ql-btn ql-btn--outline ql-header-cta" href="{prefix}{text["contact_href"]}">{text["contact"]}</a>'
    block = header.group(0).replace('<div class="sc_layouts_search">', button + '<div class="sc_layouts_search">')
    return markup[:header.start()] + block + markup[header.end():]


def catalogue_request(markup):
    markup = re.sub(r'<p>Demandez notre catalogue :</p><p class="ql-catalogue-request">.*?</p>',
                    '<p>Demandez notre catalogue training@q-leap.eu</p>', markup, flags=re.S)
    old = '<p>Demandez notre catalogue training@q-leap.eu</p>'
    new = ('<p>Demandez notre catalogue par e-mail.</p><p class="ql-catalogue-request">'
           '<a class="ql-btn ql-btn--solid" href="mailto:training@q-leap.eu?subject=Catalogue%20des%20formations">Recevoir le catalogue</a></p>')
    return markup.replace(old, new)


if __name__ == '__main__':
    changed = 0
    for file in pages():
        path = os.path.join(ROOT, file)
        markup = open(path, newline='').read()
        if 'data-redirect' in markup[:300] or 'data-blog-redirect' in markup[:300] or '</head>' not in markup:
            continue
        lang = 'en' if file.startswith('en/') or file.endswith('.en.html') else 'fr'
        prefix = prefix_for(file)
        updated = add_assets(markup, prefix)
        updated = header_cta(updated, prefix, TEXT[lang])
        updated = re.sub(r'<div class="ql-hero__actions">.*?</div>', '', updated)  # one button at the top: the header's
        if file == 'training/index.html':
            updated = catalogue_request(updated)
        if updated != markup:
            open(path, 'w', newline='').write(updated)
            changed += 1
    print(changed, 'pages mises à jour')
