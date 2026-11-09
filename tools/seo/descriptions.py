"""Meta descriptions (<meta name="description">), the snippet Google shows under the page title.

WordPress (Yoast) printed one only where someone had written it: 147 indexable pages of the export
had none. The texts live in two places, so they survive the page builds:

- blog posts: the `description` field of content/blog/<lang>/<slug>.json (« Description pour Google
  et les réseaux sociaux » in Pages CMS), which tools/blog/build.py already copies to og:description;
- every other page: content/seo/descriptions.json, {"<path>/": "<description>"} ("" = home page).

A page already carrying a non-empty description keeps it unless a text is given here. Redirect pages
and noindex pages are left alone. Idempotent: the Build content workflow runs it after the trainings
and blog pages are generated.
Usage: python3 tools/seo/descriptions.py"""
import glob
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP = {'tools', 'docs', 'assets', 'content', 'node_modules'}
DESCRIPTION = re.compile(r'<meta name="description" content="[^"]*"\s*/?>')
TITLE = re.compile(r'^([ \t]*)(<title>.*?</title>)(\r?\n)', re.M)


def texts():
    """{path: description} from the blog posts and content/seo/descriptions.json."""
    found = {}
    for file in glob.glob(os.path.join(ROOT, 'content', 'blog', '*', '*.json')):
        lang = os.path.basename(os.path.dirname(file))
        post = json.load(open(file, encoding='utf-8'))
        if post.get('description', '').strip():
            prefix = '' if lang == 'fr' else lang + '/'
            found[prefix + os.path.basename(file)[:-len('.json')] + '/'] = post['description'].strip()
    pages = os.path.join(ROOT, 'content', 'seo', 'descriptions.json')
    if os.path.exists(pages):
        found.update({path: text.strip() for path, text in json.load(open(pages, encoding='utf-8')).items() if text.strip()})
    return found


def main():
    descriptions = texts()
    changed = 0
    for path, text in sorted(descriptions.items()):
        file = os.path.join(ROOT, path, 'index.html')
        if not os.path.exists(file) or set(path.split('/')) & SKIP:
            continue
        markup = open(file, encoding='utf-8', newline='').read()
        if 'data-redirect' in markup[:300] or re.search(r'<meta name="robots" content="[^"]*noindex', markup):
            continue
        current = DESCRIPTION.search(markup)
        if current and html.unescape(re.search(r'content="([^"]*)"', current.group(0)).group(1)).strip() == text:
            continue
        tag = f'<meta name="description" content="{html.escape(text, quote=True)}" />'
        if current:
            updated = DESCRIPTION.sub(lambda match: tag, markup, count=1)
        else:
            updated = TITLE.sub(lambda match: match.group(0) + match.group(1) + tag + match.group(3), markup, count=1)
        if updated != markup:
            open(file, 'w', encoding='utf-8', newline='').write(updated)
            changed += 1
    print(f'Meta descriptions : {len(descriptions)} textes, {changed} pages mises à jour')


if __name__ == '__main__':
    main()
