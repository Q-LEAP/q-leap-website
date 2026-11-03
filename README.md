# Q-Leap website

Static version of [q-leap.eu](https://q-leap.eu), migrated off WordPress (WordPress.com + Elementor + Qwery theme) to GitHub Pages. HTML, CSS and vanilla JavaScript only.

- **Production:** https://q-leap.eu, still WordPress.com until the switch.
- **Branches:** work on `dev`, merge into `main` when a change is done. `main` is what GitHub Pages will publish.

## Run locally

```sh
python3 -m http.server 8766
# open http://localhost:8766/
```

## Modifier le blog et les formations

Dans Pages CMS (https://app.pagescms.org), sans code : voir [docs/editing.md](docs/editing.md). Les pages sont régénérées par le workflow GitHub *Build content*.

## Mettre à jour les formations (éditeur local)

```sh
npm run formations   # éditeur sur http://localhost:8790/
```

Voir [docs/trainings.md](docs/trainings.md).

## Vitesse

Le site publié est optimisé au déploiement (`tools/perf/optimize.py --root _site`, workflow *Deploy test site*) : une seule feuille de style par page à la place des 70 à 100 de WordPress, sans les règles qui ne servent pas à la page, images lourdes en WebP, images hors écran chargées en différé. Le dépôt garde les pages telles que générées ; les copies WebP (`<image>.<ext>.webp`) y sont versionnées.

## Docs

- [docs/editing.md](docs/editing.md): editing the blog and the trainings in Pages CMS, how pages are regenerated
- [docs/trainings.md](docs/trainings.md): training content, the local training editor and the page generator
- [docs/page-inventory.md](docs/page-inventory.md): the WordPress pages and what we keep, disable or delete (review page: http://localhost:8766/tools/inventory/)
