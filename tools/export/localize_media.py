"""Point every WordPress media URL left in the pages at the copy in this repository.

The export kept some absolute URLs (Jetpack image CDN i0.wp.com/q-leap.eu/wp-content/uploads/…,
q-leap.eu/wp-content/uploads/…, VideoPress files). Once q-leap.eu is served by GitHub Pages they
stop working: the CDN fetches the originals from q-leap.eu, where WordPress is gone. Each file is
downloaded once into assets/images/<year>/<month>/ (assets/videos/ for VideoPress) while WordPress
is still online, then referenced relatively (absolute https://q-leap.eu/… in meta tags, which need
absolute URLs). Content files (content/**/*.json, read by the blog and training builds) get
root-relative /assets/… addresses, like the files Pages CMS uploads. Idempotent. Usage: python3 tools/export/localize_media.py [--dry-run]
"""
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP_DIRS = {'tools', 'reference', 'node_modules', '.git', 'content'}
SITE = 'https://q-leap.eu/'
# Backslashes end a URL too: in the JSON content files, HTML attribute quotes are escaped (\").
MEDIA = re.compile(r'https?://(?:i[0-3]\.wp\.com/)?(?:www\.)?q-leap\.eu/wp-content/uploads/([^"\'\s<>)&?\\]+)(?:\?[^"\'\s<>)\\]*)?'
                   r'|https://videos\.files\.wordpress\.com/[^"\'\s<>)/\\]+/([^"\'\s<>)?\\]+)')
# Page templates (tools/*/templates) and the folder depth of the pages built from them.
TEMPLATES = {'tools/blog/templates/post.fr.html': '..', 'tools/blog/templates/post.en.html': '../..',
             'tools/trainings/templates/training.fr.html': '../..', 'tools/trainings/templates/training.en.html': '../../..'}
META = re.compile(r'<(?:meta|link)\b[^>]*>', re.I)


def local_path(match):
    """Repository path of the media file for a matched URL."""
    if match.group(1):
        return 'assets/images/' + urllib.parse.unquote(match.group(1))
    return 'assets/videos/' + urllib.parse.unquote(match.group(2))


def download(url, path):
    full = os.path.join(ROOT, path)
    if os.path.exists(full):
        return True
    source = re.sub(r'^https?://i[0-3]\.wp\.com/', 'https://', url.split('?')[0])
    try:
        request = urllib.request.Request(source, headers={'User-Agent': 'Mozilla/5.0 (q-leap.eu migration)'})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
    except Exception as error:  # report and keep the original URL for this file
        print('FAILED', source, error)
        return False
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'wb') as handle:
        handle.write(data)
    print('downloaded', path, len(data))
    return True


def localize(page, dry_run, base=None):
    with open(page, encoding='utf-8', newline='') as handle:
        html = handle.read()
    base = base or os.path.relpath(ROOT, os.path.dirname(page))
    meta_spans = [m.span() for m in META.finditer(html)]

    def replace(match):
        path = local_path(match)
        if not dry_run and not download(match.group(0), path):
            return match.group(0)
        in_meta = any(start <= match.start() < end for start, end in meta_spans)
        quoted = urllib.parse.quote(path)
        if in_meta:
            return SITE + quoted
        return quoted if base == '.' else f'{base}/{quoted}'

    updated = MEDIA.sub(replace, html)
    if updated != html and not dry_run:
        with open(page, 'w', encoding='utf-8', newline='') as handle:
            handle.write(updated)
    return updated != html


def localize_content(path, dry_run):
    with open(path, encoding='utf-8', newline='') as handle:
        text = handle.read()

    def replace(match):
        local = local_path(match)
        if not dry_run and not download(match.group(0), local):
            return match.group(0)
        return '/' + urllib.parse.quote(local)

    updated = MEDIA.sub(replace, text)
    if updated != text and not dry_run:
        with open(path, 'w', encoding='utf-8', newline='') as handle:
            handle.write(updated)
    return updated != text


def main():
    dry_run = '--dry-run' in sys.argv
    changed = 0
    for directory, subdirectories, files in os.walk(ROOT):
        subdirectories[:] = [name for name in subdirectories if name not in SKIP_DIRS and not name.startswith('.')]
        for name in files:
            if name.endswith('.html'):
                changed += localize(os.path.join(directory, name), dry_run)
    for template, base in TEMPLATES.items():
        changed += localize(os.path.join(ROOT, template), dry_run, base)
    for directory, _, files in os.walk(os.path.join(ROOT, 'content')):
        for name in files:
            if name.endswith('.json'):
                changed += localize_content(os.path.join(directory, name), dry_run)
    print('files changed:', changed)


if __name__ == '__main__':
    main()
