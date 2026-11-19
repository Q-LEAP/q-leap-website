"""Removes the ChatGPT markup pasted with some texts (2026-11-19).

Texts copied from ChatGPT into the WordPress editor kept the conversation's HTML: wrappers such as
<div class="group/conversation-turn … agent-turn">, <div class="markdown prose …">, the bot avatar
(<div class="gizmo-bot-avatar … h-8 w-8 …">, which on the home page held the whole paragraph) and
attributes such as data-message-author-role, data-message-id, data-testid="conversation-turn-…" (the forms' own
data-testid stay: the form checks use them), data-start with data-end.
No stylesheet of the site styles those classes, so the pages look the same without them; screen
readers and checkers (Lighthouse: contrast, accessibility tree) saw a meaningless nesting.

The wrappers are unwrapped (the tag goes, its content stays); a wrapper left empty goes entirely.
Usage: python3 tools/export/clean_chatgpt.py [page.html …]   (default: every page that has some)"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Utility classes of ChatGPT's Tailwind markup; a div/span whose classes are all of this kind is a wrapper
TAILWIND = re.compile(r'^(?:[\w.-]+:)*(?:-?(?:flex|grid|relative|absolute|group|items|justify|self|gap|p[xytblr]?|m[xytblr]?|w|h|min|max|'
                      r'rounded|overflow|text|bg|break|whitespace|markdown|prose|gizmo|light|dark|visible|empty|first|juice|'
                      r'agent|final|shrink|grow|basis|order|leading|font|space|z|top|left|right|bottom|inset)\b[^\s]*|\[[^\]]*\][^\s]*)$')
# data-start / data-end only as ChatGPT writes them, together (the theme's counters use data-start alone)
GPT_ATTRIBUTE = re.compile(r'\sdata-(?:message-author-role|message-id|message-model-slug|is-last-node|is-only-node)="[^"]*"'
                           r'|\sdata-testid="conversation-turn-\d+"|\sdata-start="\d+"\s+data-end="\d+"')
OPEN = re.compile(r'<(div|span)\b([^>]*)>')


def is_wrapper(attributes):
    if re.search(r'data-message-author-role|data-testid="conversation-turn', attributes):
        return True
    classes = re.search(r'\bclass="([^"]*)"', attributes)
    if not classes or not classes.group(1).strip():
        return False
    tokens = classes.group(1).replace('&amp;', '&').split()
    return all(TAILWIND.match(token) for token in tokens) and any(
        re.search(r'gizmo|prose|markdown|token|agent-turn|conversation-turn|text-message|juice|flex|^pt-0|^(?:sm|md|lg|xl):', token) for token in tokens)


def matching_close(markup, tag, start):
    depth = 0
    for match in re.finditer(rf'<(/?){tag}\b[^>]*>', markup[start:]):
        depth += -1 if match.group(1) else 1
        if depth == 0:
            return start + match.start(), start + match.end()
    return None


def clean(markup):
    changed = True
    while changed:
        changed = False
        for match in OPEN.finditer(markup):
            if not is_wrapper(match.group(2)):
                continue
            close = matching_close(markup, match.group(1), match.start())
            if not close:
                continue
            inner = markup[match.end():close[0]]
            markup = markup[:match.start()] + ('' if not inner.strip() else inner) + markup[close[1]:]
            changed = True
            break
    return GPT_ATTRIBUTE.sub('', markup)


def main():
    files = sys.argv[1:]
    if not files:
        # pages under version control only (reference/ holds captures of the WordPress site, not to be changed)
        listed = subprocess.run(['git', 'ls-files', '-z', '*.html'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split('\0')
        files = [os.path.join(ROOT, name) for name in listed if name and not name.startswith(('tools/', 'docs/'))]
    count = 0
    for file in files:
        markup = open(file, encoding='utf-8', newline='').read()
        cleaned = clean(markup)
        if cleaned != markup:
            open(file, 'w', encoding='utf-8', newline='').write(cleaned)
            count += 1
            print(os.path.relpath(file, ROOT))
    print(f'{count} pages nettoyées')


if __name__ == '__main__':
    main()
