# Journal d'optimisation

Passe d'optimisation sur la branche `optimisation` : une tâche par commit, sans changement visuel
(voir CLAUDE.md). Chaque entrée dit ce qui a été fait, le gain mesuré et comment c'est vérifié, pour
ne pas refaire deux fois la même chose.

| Date | Tâche | Gain | Vérification |
|---|---|---|---|
| 2026-11-06 | Vidéo de la page Innovations (`assets/videos/qub-_-q-leap-video.mp4`) réencodée : H.264 High, même définition (2112×1160) et 60 i/s, CRF 23 preset veryslow, piste audio retirée (la vidéo est toujours muette et n'a pas de contrôles), `faststart` pour démarrer avant la fin du téléchargement | 13,4 Mo → 4,4 Mo (−67 %) | SSIM 0,9966 sur toute la vidéo, comparaison d'images côte à côte identique |

## Pistes repérées, pas encore faites

- Affiche (`poster`) de cette vidéo : PNG non converti en WebP par `tools/perf/optimize.py` (l'attribut `poster` n'est pas traité).
- Polices : formats anciens (`.eot`, `.svg`, `.ttf`) encore référencés à côté des `.woff2`.
- Images lourdes sous 250 ko non converties, PNG photographiques.
