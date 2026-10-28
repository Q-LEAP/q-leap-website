"""Fusionne les feuilles de style exportées (tools/export/build/css/*.json) en assets/css/main.css.

Ordre de cascade de la première page qui charge chaque feuille ; une feuille déjà vue n'est pas
répétée. Les chemins /assets/... deviennent relatifs à assets/css/. PurgeCSS viendra ensuite.
"""
import glob, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
seen, parts = set(), []
order = sorted(glob.glob(os.path.join(ROOT, 'tools/export/build/css/*.json')), key=lambda p: (not p.endswith('home.json'), p))
for path in order:
    for chunk in json.load(open(path)):
        key = chunk['css'].strip()
        if not key or key in seen:
            continue
        seen.add(key)
        parts.append(f"/* {chunk['id']} */\n{key}\n")
css = '\n'.join(parts).replace('url("/assets/', 'url("../')
os.makedirs(os.path.join(ROOT, 'assets/css'), exist_ok=True)
open(os.path.join(ROOT, 'assets/css/main.css'), 'w').write(css)
print('main.css', len(css) // 1024, 'KB from', len(parts), 'stylesheets')
