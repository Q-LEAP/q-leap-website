# Modifier le blog et les formations (Pages CMS)

Les formateurs et l'équipe modifient le contenu du site dans **Pages CMS**, une interface web : pas de code, pas de logiciel à installer.

## Accès

1. Ouvrir **https://app.pagescms.org**.
2. Se connecter :
   - avec **GitHub** si l'on a un compte membre de l'organisation Q-LEAP ;
   - sinon avec son **adresse e-mail** : un administrateur l'invite au préalable (Pages CMS → dépôt `Q-LEAP/q-leap-website` → *Collaborators*). Les personnes invitées par e-mail n'ont pas besoin de compte GitHub.
3. Choisir le dépôt **Q-LEAP/q-leap-website**, puis la branche (`main` = site en ligne une fois GitHub Pages activé ; `dev` = travail en cours).

## Blog

*Blog → Articles en français* ou *Articles en anglais*.

- **Nouvel article** : « Add an entry ». Remplir titre, date, catégories, image principale, texte. Le nom du fichier devient l'adresse de la page (`q-leap.eu/<nom>/`, ou `q-leap.eu/en/<nom>/`) : en minuscules, avec des tirets.
- **Texte** : éditeur avec gras, titres, listes, liens et images (bouton image → envoi de fichier).
- **Résumé** : le texte de la carte dans la liste du blog. Vide = les 30 premiers mots du texte.
- **Description** : le texte affiché par Google et LinkedIn.
- **Actualités de l'accueil** : les 4 articles les plus récents cochés « Afficher dans les actualités de la page d'accueil ».
- **Version dans l'autre langue** : le nom du fichier de l'article traduit. Le sélecteur de langue du menu y mène (sinon vers le blog de l'autre langue).
- **Brouillon** : l'article n'apparaît nulle part ; s'il était publié, son adresse renvoie vers le blog.
- **Anciens articles** à la mise en page élaborée (images côte à côte, colonnes…) : leur champ *Texte* est vide, ce qui garde leur page d'origine. On peut quand même changer titre, date, catégories, image, description. Pour réécrire leur texte, remplir *Texte* : la page prend alors la mise en page simple.

L'ordre du blog : le plus récent d'abord en français ; en anglais, comme sur WordPress, les plus lus d'abord.

## Formations

*Formations* : une fiche par formation, avec la version française et l'anglaise.

- **Sessions** : date de début, date de fin, langue, format. Les sessions passées disparaissent toutes seules ; sans session à venir, la fiche affiche le formulaire de demande.
- **Prix, durée, langues, format, certificat** : un champ vide masque son bloc sur la fiche.
- **Programme / Syllabus** : envoi de PDF.
- **Filtres du catalogue** : cases Thème / Niveau / Format / Certification / Langue.
- **Images** : la carte du catalogue (format portrait, environ 900 × 1200) et l'image de partage sur les réseaux sociaux.
- **Position dans le catalogue** : 0 = en premier.
- **Adresse de la page** : changer l'adresse d'une formation publiée est possible, mais l'ancienne adresse ne redirige pas toute seule ; demander à l'équipe technique (champ `previousSlugs`).

## Publication

La branche `dev` est publiée sur https://q-leap.eu/ (GitHub Pages) automatiquement après chaque modification (workflow *Deploy q-leap.eu*). Il n'y a plus de site de test séparé : l'adresse q-leap.github.io/q-leap-website/ redirige vers q-leap.eu. La prévisualisation de la branche UXEnhance reste à l'adresse q-leap.eu/ux-enhance/, non indexée par Google.

## Après « Save »

Chaque enregistrement est un commit dans le dépôt. Le workflow GitHub **Build content** (`.github/workflows/build-content.yml`) régénère alors les pages (fiches, catalogues, articles, listes du blog, actualités de l'accueil) et les ajoute au dépôt. Compter une à deux minutes ; l'onglet *Actions* du dépôt montre où il en est.

## Mise en place (une fois, par un administrateur)

1. Sur https://app.pagescms.org, se connecter avec GitHub et **installer l'application Pages CMS** sur l'organisation Q-LEAP, pour le dépôt `q-leap-website` (droit administrateur de l'organisation requis).
2. Ouvrir le dépôt dans Pages CMS : il lit `.pages.yml` (ce qui est éditable et comment).
3. Inviter les formateurs (*Collaborators*, par e-mail).
4. Vérifier dans GitHub → *Settings → Actions → General* que les workflows ont le droit d'écrire (*Read and write permissions*), sinon la régénération ne peut pas enregistrer les pages.

## Pour l'équipe technique

| Fichier | Rôle |
|---|---|
| `.pages.yml` | Champs proposés dans Pages CMS (blog FR/EN, formations), dossiers d'envoi des images et PDF (`assets/images/uploads`, `assets/documents/uploads`) |
| `content/blog/<langue>/<adresse>.json` | Un article par fichier |
| `content/trainings/<id>.json`, `content/training-settings.json` | Une formation par fichier ; filtres et libellés communs |
| `tools/blog/build.py` | Met à jour les pages d'articles, crée les nouvelles à partir de `tools/blog/templates/post.<langue>.html`, régénère le blog et les actualités de l'accueil (recadrages d'images avec Pillow) |
| `tools/trainings/build.mjs` | Fiches et catalogues des formations (voir `docs/trainings.md`) |
| `tools/blog/import_pages.py` | Import initial des articles depuis les pages exportées (03/11/2026) |
| `tools/export/diff_live.py` | Compare le site WordPress en ligne aux pages exportées (ce qui a changé depuis l'export) |

En local : `python3 tools/blog/build.py` (avec Pillow : `pip install pillow`) et `node tools/trainings/build.mjs`. L'éditeur local des formations (`npm run formations`) fonctionne toujours.
