#!/usr/bin/env python3
"""Watch that the site's forms can still deliver: silent when everything works, a list of problems
(and exit code 1) when not. Run every hour by .github/workflows/forms-monitor.yml, which opens a
GitHub issue on failure (its assignee gets an e-mail) and closes it when the forms work again.

Checks, without sending any message:
- FormSubmit (the service that mails the forms to digital@q-leap.eu) answers;
- assets/js/main.js on the site still holds the form handler and its fallback;
- the contact pages (FR/EN) have their form;
- every job linked from join-us/ and en/career/ is a real page with an application form (a job left
  in draft, or a page replaced by a redirect, breaks applications without any error elsewhere);
- the training pages linked from the catalogues have their registration form.

Usage: python3 tools/verify/forms_monitor.py [site base URL]   (default: https://q-leap.eu/)
"""
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://q-leap.eu/').rstrip('/') + '/'
UA = {'User-Agent': 'Q-Leap forms monitor (github.com/Q-LEAP/q-leap-website)'}
FORM_SERVICE = 'https://formsubmit.co/'
problems = []


def get(url, timeout=30):
    """(status, final url, body) — never raises."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as response:
            return response.status, response.geturl(), response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        return error.code, url, ''
    except Exception as error:  # network error, timeout
        return 0, url, str(error)


def check_service():
    status = 0
    for _ in range(3):  # a single network hiccup is not an outage
        status, _, _ = get(FORM_SERVICE, timeout=20)
        if status == 200:
            return
    problems.append(f'FormSubmit ne répond pas (HTTP {status or "aucune réponse"}) : les formulaires du site '
                    f'basculent sur le lien e-mail de secours, aucun message n\'arrive automatiquement.')


def check_script():
    status, _, js = get(BASE + 'assets/js/main.js')
    if status != 200:
        problems.append(f'assets/js/main.js inaccessible (HTTP {status}).')
        return
    for needle, what in (('formsubmit.co', 'l\'envoi vers FormSubmit'), ('function initForms', 'le gestionnaire des formulaires'),
                         ('const fallback', 'le lien e-mail de secours')):
        if needle not in js:
            problems.append(f'assets/js/main.js ne contient plus {what}.')


def page_has(path, marker, label):
    status, final, html = get(BASE + path)
    if status != 200:
        problems.append(f'{label} : {BASE + path} répond HTTP {status}.')
    elif 'http-equiv="refresh"' in html or 'data-redirect' in html[:300]:
        problems.append(f'{label} : {BASE + path} est une simple redirection, sans formulaire.')
    elif marker not in html:
        problems.append(f'{label} : {BASE + path} n\'a plus de formulaire.')
    return html if status == 200 else ''


def linked_pages(listing, pattern):
    status, final, html = get(BASE + listing)
    if status != 200:
        problems.append(f'Liste {BASE + listing} : HTTP {status}.')
        return []
    paths = set()
    for href in re.findall(r'href="([^"#?]+)"', html):
        path = urllib.parse.urlparse(urllib.parse.urljoin(final, href)).path
        base_path = urllib.parse.urlparse(BASE).path
        if path.startswith(base_path) and re.search(pattern, path[len(base_path):]):
            paths.add(path[len(base_path):])
    return sorted(paths)


def main():
    check_service()
    check_script()
    page_has('contact/', 'wpcf7-form', 'Contact (FR)')
    page_has('en/contact/', 'wpcf7-form', 'Contact (EN)')
    jobs = linked_pages('join-us/', r'^jobs/[^/]+/$') + linked_pages('en/career/', r'^en/jobs/[^/]+/$')
    if not jobs:
        problems.append('Aucune offre d\'emploi trouvée sur join-us/ et en/career/.')
    for path in jobs:
        page_has(path, 'awsm-application-form', 'Candidature')
    trainings = linked_pages('training/', r'^trainings/[^/]+/$') + linked_pages('en/training/', r'^en/trainings/[^/]+/$')
    for path in trainings:
        page_has(path, 'nf-form-layout', 'Formation')
    if problems:
        print(f'{len(problems)} problème(s) sur {BASE} :')
        for problem in problems:
            print('- ' + problem)
        sys.exit(1)
    print(f'OK : FormSubmit répond, {len(jobs)} offres et {len(trainings)} formations avec leur formulaire, contact FR/EN.')


if __name__ == '__main__':
    main()
