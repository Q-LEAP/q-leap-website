# Q-Leap website

Static version of [q-leap.eu](https://q-leap.eu), migrated off WordPress (WordPress.com + Elementor + Qwery theme) to GitHub Pages. HTML, CSS and vanilla JavaScript only.

- **Production:** https://q-leap.eu, still WordPress.com until the switch.
- **Branches:** work on `dev`, merge into `main` when a change is done. `main` is what GitHub Pages will publish.

## Run locally

```sh
python3 -m http.server 8766
# open http://localhost:8766/
```

## Docs

- [docs/page-inventory.md](docs/page-inventory.md): the WordPress pages and what we keep, disable or delete (review page: http://localhost:8766/tools/inventory/)
