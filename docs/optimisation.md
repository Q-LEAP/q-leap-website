# Journal d'optimisation

Passe d'optimisation sur la branche `optimisation` : une tâche par commit, sans changement visuel
(voir CLAUDE.md). Chaque entrée dit ce qui a été fait, le gain mesuré et comment c'est vérifié, pour
ne pas refaire deux fois la même chose.

| Date | Tâche | Gain | Vérification |
|---|---|---|---|
| 2026-11-06 | Vidéo de la page Innovations (`assets/videos/qub-_-q-leap-video.mp4`) réencodée : H.264 High, même définition (2112×1160) et 60 i/s, CRF 23 preset veryslow, piste audio retirée (la vidéo est toujours muette et n'a pas de contrôles), `faststart` pour démarrer avant la fin du téléchargement | 13,4 Mo → 4,4 Mo (−67 %) | SSIM 0,9966 sur toute la vidéo, comparaison d'images côte à côte identique |
| 2026-11-06 | `tools/perf/optimize.py` utilisable sous Windows : chemins des pages en `/` (avant : `en\index.html`, d'où des liens `en/assets/css/bundle/…` cassés dans la copie optimisée) et lecture/écriture en UTF-8 (avant : plantage cp1252). Sans effet sur le déploiement Linux | Permet de tester localement la copie publiée | Copie optimisée construite sous Windows : plus aucune 404 sur 8 pages × 3 largeurs |
| 2026-11-06 | Seuil des copies WebP de `tools/perf/optimize.py` abaissé de 250 ko à 40 ko (même qualité 84) : 281 nouvelles copies `.webp` commitées (35 images où le WebP n'était pas plus léger : `.skip`) | 31,2 Mo → 14,1 Mo sur ces images ; accueil 1,94 → 1,64 Mo, formation 1,76 → 1,21 Mo, actualités 1,45 → 1,12 Mo | PSNR ≥ 33 dB sur chaque image (rendu sur fond blanc et noir), comparaison zoomée identique ; captures 8 pages × 3 largeurs : écarts limités aux zones d'images (< 0,6 % des pixels), aucune erreur console |

## Pistes repérées, pas encore faites

- CSS : 600 à 760 ko par page après `optimize.py` (le plus gros poste de toutes les pages mesurées).
- HTML : 160 à 260 ko par page.
- Polices : formats anciens (`.eot`, `.svg`, `.ttf`) encore référencés à côté des `.woff2`.
- Images lourdes sous 250 ko non converties, PNG photographiques.
