# Formations : éditeur et génération des pages

Les formations (fiches `trainings/<slug>/`, `en/trainings/<slug>/` et la grille des catalogues `training/`, `en/training/`) ne se modifient plus dans WordPress : leur contenu est dans **`content/trainings.json`**, édité avec l'éditeur, et les pages sont générées à partir de ce fichier.

## Utiliser l'éditeur

```sh
npm run formations
# puis ouvrir http://localhost:8790/
```

- **Liste à gauche** : les formations dans l'ordre du catalogue (glisser-déposer pour le changer), recherche, « + Nouvelle formation ».
- **Contenu FR / Contenu EN** : titre, titre de l'onglet (SEO), adresse de la page, texte « Informations » (gras, italique, liste, lien), prix, durée, langues, format, certificat, programme et syllabus (envoi de PDF). Sur l'onglet EN, « Copier depuis FR » reprend la valeur française. Un champ vide masque son bloc sur la fiche, comme sur WordPress.
- **Sessions** : date de début, date de fin, langue (facultatif), format, pour chaque langue. Les sessions passées n'apparaissent plus sur le site (à la génération, et chez le visiteur si les pages n'ont pas été régénérées). Sans session à venir, la fiche affiche le formulaire de demande. Le mois et la plage de dates (« 8 décembre - 10 décembre 2026 ») sont calculés automatiquement.
- **Catalogue & filtres** : image de la carte (FR et EN) et cases des filtres Thème / Niveau / Format / Certification / Langue utilisées par le filtrage du catalogue.
- **Publiée / brouillon** : un brouillon n'est ni généré ni visible dans le catalogue.
- **Aperçu** (à droite) : la vraie fiche, mise à jour pendant la saisie, en FR ou EN, PC / tablette / mobile. « Ouvrir ↗ » l'ouvre en grand.
- **Libellés des pages** : textes fixes communs à toutes les fiches (intitulés des blocs, bouton « S'inscrire », noms des mois…).
- **Enregistrer** (⌘S) : écrit `content/trainings.json` et régénère toutes les fiches et les deux catalogues. Les erreurs bloquantes (titre manquant, adresse invalide ou en double, session qui finit avant de commencer) sont signalées.
- **Publier** : enregistre, puis `git commit` + `git push` des formations, des catalogues, des images et des PDF (branche courante, `dev`).

Changer l'adresse d'une formation publiée garde l'ancienne adresse en redirection (`previousSlugs`). Supprimer une formation retire ses pages.

## Comment c'est construit

| Fichier | Rôle |
|---|---|
| `content/trainings.json` | Les 11 formations, chacune avec ses versions `fr` et `en`, ses filtres, ses images et ses sessions, plus les libellés modifiés |
| `tools/trainings/build.mjs` | Génère les fiches et la grille des catalogues ; fonctions réutilisées par l'éditeur (aperçu) |
| `tools/trainings/templates/training.{fr,en}.html` | Gabarits : la fiche « ISTQB Foundation » exportée, avec des emplacements `{{…}}` |
| `tools/trainings/templates/jsonld.{fr,en}.json` | Modèle des données structurées Yoast (SEO) |
| `tools/trainings/editor/` | L'éditeur : `server.mjs` (serveur local, sans dépendance) et `app/` (interface) |
| `tools/trainings/import_wordpress.py` | Import ponctuel depuis WordPress (28/10/2026, en lecture seule) ; ne plus relancer une fois le contenu modifié dans l'éditeur |
| `tools/trainings/make_templates.py` | Recrée les gabarits si l'habillage commun des fiches change |

Le balisage généré reproduit celui du thème WordPress (`single-trainings` du thème enfant Qwery, widget Elementor Pro « Publications » en cartes, filtres Ajax Search Pro), avec les mêmes styles : les 22 fiches générées sont identiques au pixel près aux pages exportées, et la grille du catalogue au site en ligne. Quelques comportements du thème sont reproduits volontairement : le fil d'Ariane tronqué à 49 octets (`breadcrumbTitle`), la « texturisation » des titres WordPress (`wpTitle`), l'ordre des colonnes d'informations.

Côté visiteur (`assets/js/main.js`) : filtrage et pagination du catalogue (`initTrainingCatalogue`, 6 cartes par page, « OU » dans un groupe de filtres, « ET » entre groupes, recherche à partir de 2 caractères), cartes Elementor Pro (`initElementorPosts`), popup d'inscription (`initPopups`) pré-remplie avec la session choisie (`initSessionRegistration`).

## À faire

- Envoi des formulaires (inscription et demande) : GitHub Pages ne traite pas les envois ; à brancher sur le service retenu (FormSubmit vers contact@q-leap.eu comme pour q-guard.app, à valider).
- Les 7 fiches anglaises dont le contenu est resté en français (voir `docs/training-translations-en.md`) se corrigent maintenant dans l'éditeur.
