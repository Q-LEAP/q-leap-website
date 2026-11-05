# Bascule de q-leap.eu : WordPress.com → GitHub Pages, DNS chez OVH

> Préparé le 2026-11-04, même méthode que q-guard.app (dépôt qguard-website, docs/ovh-switch.md).

## État avant la bascule

- **Domaine chez OVH** (renouvellement automatique, expire le 2027-03-31), **délégué à
  `ns1/ns2/ns3.wordpress.com`** : toute la zone (site, messagerie, sous-domaines `*.internal`) vit
  chez WordPress.com. Pas de zone DNS OVH, pas de DNSSEC (aucun DS au registre).
- **Messagerie @q-leap.eu chez Microsoft 365** (MX, autodiscover, DKIM selector1/2, msoid). Envois
  aussi par Odoo (DKIM `odoo._domainkey`) et Brevo (SPF). Ce sont les enregistrements qui comptent.
- **Sous-domaines internes** : `internal` (A 213.135.237.56) et les démos `shop-demo`, `bank-demo`,
  `q-guard` × `dev/test/client1/client2.internal`, avec leurs CNAME de validation DigiCert/Sectigo.
- TTL des NS au registre .eu : **86 400 s**. Une bascule (et un retour arrière) peut mettre jusqu'à
  24 h à atteindre tous les résolveurs ; pendant ce temps les deux sites coexistent.

## La zone OVH

`tools/dns/make_zone.sh > tools/dns/zone.txt` : les enregistrements listés dans
`tools/dns/records.txt`, valeurs lues en direct sur `ns1.wordpress.com` (rien n'est retapé), plus le
web vers GitHub Pages. Différences voulues avec WordPress.com :

| Enregistrement | WordPress.com | OVH |
|---|---|---|
| `@ A` | 192.0.78.154 / .245 (WordPress) | 185.199.108–111.153 + AAAA GitHub |
| `www` | CNAME q-leap.eu | CNAME q-leap.github.io |
| `* CNAME q-leap.eu` | présent | **retiré** : sur GitHub Pages, un joker permet à n'importe qui de réclamer un sous-domaine |
| `_domainconnect` | TXT WordPress.com | retiré (propre à WordPress.com) |

Le SPF garde `include:_spf.wpcloud.com` et `a:q-leap.eu` : inoffensifs, retirables plus tard.

Vérification avant la bascule (comparaison serveur par serveur) : `tools/dns/compare.sh dnsXX.ovh.net`.

## Ordre de la bascule

1. Production sur la branche `dev` (seule branche autorisée par l'environnement `github-pages`) :
   `.github/workflows/deploy.yml` publie le site sans `noindex`, avec `robots.txt` et `sitemap.xml`.
2. Domaine posé sur GitHub Pages (`{"cname":"q-leap.eu"}`), puis redéploiement.
3. Zone OVH créée et importée (aucun effet en ligne).
4. **Serveurs de noms remplacés** par ceux d'OVH : le seul geste qui a un effet.
5. Certificat HTTPS GitHub, puis `https_enforced`.

## Retour arrière

OVH → `q-leap.eu` → *Serveurs DNS* → remettre `ns1.wordpress.com`, `ns2.wordpress.com`,
`ns3.wordpress.com` (API : `POST /domain/q-leap.eu/nameServers/update`). WordPress.com n'a pas été
modifié : il reprend dès que les résolveurs suivent. Puis retirer le domaine de GitHub Pages.

## Après la bascule

- **WordPress** reste en ligne chez WordPress.com (rien n'y est supprimé), mais n'est plus à
  l'adresse q-leap.eu : l'administration passe par l'adresse WordPress.com du site.
- **Formulaires** (inscriptions, contact, candidatures avec CV) : relais maison
  `tools/forms/relay` (Cloudflare Worker) qui envoie chaque demande à `digital@q-leap.eu` par Brevo
  (offre gratuite, 300 e-mails/jour). À faire une fois, voir `tools/forms/relay/README.md` :
  authentifier `q-leap.eu` dans Brevo et ajouter dans la zone OVH le TXT `brevo-code` et les deux
  CNAME DKIM qu'il donne (q-leap.eu est en DMARC `p=reject` : sans eux tout est rejeté ; le SPF
  inclut déjà Brevo), puis déployer le Worker. Si le relais ou Brevo ne répond pas, le visiteur
  reçoit un lien qui ouvre son logiciel de messagerie avec la demande déjà rédigée pour
  digital@q-leap.eu (candidatures : joindre le CV à la main). FormSubmit, utilisé jusqu'au
  2026-11-05, est abandonné (erreur 522 deux jours de suite).
- **Alerte formulaires** : dans `.github/workflows/forms-monitor.yml`, passer `SITE` à
  `https://q-leap.eu/` (le contrôle horaire vise le site de test tant que la bascule n'est pas faite).
- **Search Console** : la balise `google-site-verification` des pages est conservée ; soumettre
  `https://q-leap.eu/sitemap_index.xml`.
