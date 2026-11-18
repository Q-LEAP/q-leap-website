#!/usr/bin/env python3
"""Watch every Q-Leap website listed in tools/verify/sites.json: silent when all is well, one line per
broken site (and exit code 1) otherwise. Run every 15 minutes by .github/workflows/sites-monitor.yml,
which opens a GitHub issue per broken site (its assignee gets an e-mail) and closes it on recovery.

For each site: the address resolves and answers HTTP 200 after redirects, lands where expected,
still contains its marker text, and its TLS certificate is valid for more than CERT_WARNING_DAYS.
A failure is retried before being reported, so a single network hiccup does not send an e-mail.

Output lines: "<name>\t<problem>" — the workflow keys issues on <name>.
Usage: python3 tools/verify/sites_monitor.py [sites.json]
"""
import json
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('sites.json')
USER_AGENT = {'User-Agent': 'Q-Leap sites monitor (github.com/Q-LEAP/q-leap-website)'}
REQUEST_TIMEOUT_SECONDS = 30
ATTEMPTS = 3
RETRY_DELAY_SECONDS = 20
CERT_WARNING_DAYS = 14


def fetch(url):
    """(status, final url, body, error text) — never raises."""
    try:
        request = urllib.request.Request(url, headers=USER_AGENT)
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return response.status, response.geturl(), response.read().decode('utf-8', 'replace'), ''
    except urllib.error.HTTPError as error:
        return error.code, url, '', ''
    except urllib.error.URLError as error:
        return 0, url, '', str(error.reason)
    except Exception as error:  # timeout, connection reset…
        return 0, url, '', str(error)


def certificate_problem(host):
    try:
        context = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=REQUEST_TIMEOUT_SECONDS) as raw:
            with context.wrap_socket(raw, server_hostname=host) as tls:
                not_after = tls.getpeercert()['notAfter']
    except ssl.SSLCertVerificationError as error:
        return f'certificat HTTPS invalide ({error.verify_message})'
    except Exception as error:
        return f'connexion HTTPS impossible ({error})'
    expires = datetime.fromtimestamp(ssl.cert_time_to_seconds(not_after), timezone.utc)
    days_left = (expires - datetime.now(timezone.utc)).days
    if days_left < CERT_WARNING_DAYS:
        return f'le certificat HTTPS expire dans {days_left} jour(s) ({expires:%Y-%m-%d})'
    return ''


def normalized(url):
    parts = urllib.parse.urlsplit(url)
    return f'{parts.scheme}://{parts.netloc.lower()}{parts.path or "/"}'


def site_problem(site):
    url = site['url']
    host = urllib.parse.urlsplit(url).hostname
    try:
        socket.getaddrinfo(host, None)
    except socket.gaierror:
        return f'le nom {host} ne résout plus (DNS)'
    if url.startswith('https://') and site.get('cert', True):
        problem = certificate_problem(host)
        if problem:
            return problem
    status, final_url, body, error = fetch(url)
    if status == 0:
        return f'{url} ne répond pas ({error})'
    if status != 200:
        return f'{url} répond HTTP {status}'
    expected = site.get('expect')
    if expected and normalized(final_url) != normalized(expected):
        return f'{url} mène à {final_url} au lieu de {expected}'
    marker = site.get('marker')
    if marker and marker not in body:
        return f'{final_url} ne contient plus « {marker} » (page vide ou remplacée ?)'
    return ''


def main():
    sites = json.loads(CONFIG.read_text(encoding='utf-8'))['sites']
    pending = list(sites)
    problems = {}
    for attempt in range(ATTEMPTS):
        if attempt:
            time.sleep(RETRY_DELAY_SECONDS)
        problems = {site['name']: site_problem(site) for site in pending}
        problems = {name: problem for name, problem in problems.items() if problem}
        pending = [site for site in pending if site['name'] in problems]
        if not pending:
            break
    for name, problem in problems.items():
        print(f'{name}\t{problem}')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
