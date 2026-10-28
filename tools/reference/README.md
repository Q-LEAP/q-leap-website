# Captures de référence

`capture.mjs` photographie les pages de q-leap.eu (WordPress) en PC 1440 px, tablette 820 px et mobile 390 px, et enregistre le DOM rendu, pour servir de modèle à la reproduction statique.

Depuis le 28/10/2026 13:38, le fichier Elementor `uploads/elementor/css/custom-frontend.min.css` renvoie 404 sur le site en ligne (tout est « collé à gauche »). L'outil le remplace à la volée par `custom-frontend.min.css`, reconstitué à partir de `frontend-default.min.css` d'Elementor 4.3.5 avec le point d'arrêt tablette du site (1279 px au lieu de 1024 px). Résultat vérifié identique aux captures prises avant la panne.

```sh
node tools/reference/capture.mjs "https://q-leap.eu/,https://q-leap.eu/en/" reference/ desktop,tablet,mobile
```
