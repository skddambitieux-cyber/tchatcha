# 5.1 — Identité visuelle appliquée (TCHATCHA)

Version : 1.0 — Étape 5 (Lot 4a). Déclinaison **opérationnelle** de la marque
(`07e-identite-marque.md`) et des tokens (`07d-design-tokens.md`) : ce document
contient les spécifications exactes (valeurs, tailles, fichiers) utilisées dans
les maquettes HTML (`docs/maquettes/`) et à reproduire en production.

---

## 1. Couleurs validées (rappel — source : 07d)

| Rôle | Token | Hex | Usage |
|---|---|---|---|
| Vert TCHATCHA | `primary.500` | `#1B7A4D` | actions, lien, focus, logo |
| Vert foncé | `primary.600` | `#14633E` | pressé, en-têtes, splash-fond |
| Vert profond | `primary.700` | `#0F4F31` | fonds sombres app |
| Orange Soleil | `secondary.500` | `#FF8A3D` | CTA secondaires, prix, promos |
| Orange pressé | `secondary.600` | `#E6731F` | hover/secondary actif |
| Jaune accent | — | `#F2A93B` | badges prix/offres |
| Succès | `success` | `#1E9E57` | checks, confirmations |
| Avertissement | `warning` | `#E8A31C` | délais, attention |
| Erreur | `error` | `#D64545` | erreurs, bloquants |
| Info | `info` | `#2F6FED` | informations |
| Encre | `neutral.900` | `#1A1D1F` | textes |
| Neutre clair | `neutral.100` | `#F1F3F5` | fonds inputs |
| Fond écran | `background` | `#F7F8FA` | fond général |

## 2. Typographie

| Élément | Police | Taille / Graisse | Notes |
|---|---|---|---|
| Titres & logo | **Outfit** (Bold 700) | display 40 / title 28 / 22 / 18 | géométrique et chaleureuse |
| Corps | **Inter** | 16 / 14 / 12 | lisibilité |
| Prix | Inter (tabular-nums) | `money` 20/700 | chiffres alignés |
| Fallback | Roboto / SF | — | |

Fichiers : `Outfit[wght].ttf`, `Inter[wght].ttf` (variables, woo/variable/outfit).

## 3. Logo TCHATCHA (spécification)

### 3.1 Mot-symbole combiné
- **Symbole** : une punaise de localisation dont la tête est remplacée par une **étincelle/check** (trouver + confiance), dans un tracé épais arrondi.
- **Wordmark** : « TCHATCHA » en capitals, **Outfit Bold**, lettres espacées (tracking +2), couleur `#1B7A4D`.
- **Couple couleurs** : symbole vert `#1B7A4D` + petite étincelle orange `#FF8A3D`.
- **Clean space** : marge = hauteur du « T » de part et d'autre ; mindtage minimum 24 px.
- **Taille minimale lisible** : 48 px (combiné) / 24 px (symbole seul).

### 3.2 App icon (icône application)
| Spéc | Valeur |
|---|---|
| Fond | dégradé vertical `#14633E → #0F4F31` |
| Symbole | punaise/check **blanc** centré, ~60 % de la surface |
| Forme | coins arrondis 20 % (iOS) / masqué rond Android avec logo |
| Bordure | 1 px `#0F4F31` (safe zone) |
| Tailles | Android : mipmap 48/72/96/144/192/512 · iOS : 20/29/40/58/60/76/80/87/120/152/167/180/1024 |

### 3.3 Splash screen
| Spéc | Valeur |
|---|---|
| Fond | vert profond `#0F4F31` (ou dégradé 600→700) |
| Éléments | logo TCHATCHA blanc + symbole + sous-texte « Le bon pro, près de chez vous. » en blanc 80 % |
| Durée | ≤ 800 ms (token motion.enter) |
| Variante | aucun surcharge (pas de loader) |

### 3.4 Favicons & web
- SVG source ; rendus : 16, 32, 48, `apple-touch-icon` 180, manifest 192/512.
- Monochrome (encre) pour watermark ; variante inverse (blanc) sur fonds verts.

## 4. Illustrations (style)

| Règle | Valeur |
|---|---|
| Style | plat, 2D, contours arrondis, aucune texture réaliste |
| Palette | vert `#1B7A4D` (dominante), orange `#FF8A3D`, fonds `#E8F5EE`/`#FFE8D8` |
| Personnages | teintes de peau variées, tenues locales, sourires ; silhouette ronde (tête 1/3 de la hauteur) |
| Scènes | chantier (maçon/carreleur), ménage, restaurant/maquis, plombier, digital (ordinateur), livraison (P2) |
| Usage | onboarding (3 étapes), états vides (7b), icônes de catégorie (cartes `20`) |
| Licence | créées en interne ou achetées (pack flat), jamais de droits tiers ambigus |

## 5. Style photographique (photos pros, portfolio, avis)

| Règle | Valeur |
|---|---|
| Contenu | vrais métiers de la région, chantiers réels, boutiques, sourires sincères |
| Lumière | naturelle, dorée (matin/soir), jamais de banque d'images « générique » |
| Cadrage | couverture 4:3 pour les fiches, carré pour les avatars (crop 1:1) |
| Traitement | léger (contraste doux, saturation modérée), jamais de filtre lourd |
| Cohérence | les photos d'un même pro sont cohérentes en style (guide donné au pro) |

## 6. Le badge « Vérifié TCHATCHA »

| Élément | Spéc |
|---|---|
| Symbole | bouclier arrondi vert `#1B7A4D`, check blanc, contour `#14633E` |
| Tuile | fond `#E8F5EE`, texte `#14633E`, libellé « Vérifié TCHATCHA » (12, Inter 600) |
| Emplacements | ligne pros (résultats), fiche pro (en-tête), chat, avis |
| Règles de vie | accordé après modération humaine (BR-010) ; perte uniquement par décision tracée (BR-014) |

## 7. Comportements visuels (motion)

| Occurrence | Motion |
|---|---|
| Tap/press | `motion.fast` 150 ms (scale 0.98) |
| Transitions d'écran | `motion.normal` 250 ms |
| Succès (publication, paiement) | check animé 400 ms (`motion.slow`), pas plus |
| Réduction | `prefers-reduced-motion` → animations désactivées |

## 8. Contenu des maquettes HTML (ce document = référence)

Les maquettes (`docs/maquettes/`) appliquent exactement : couleurs §1, typo §2,
logo/splash §3, elevators & espacements des tokens 07d, badge §6, états d'écran
(skeleton, vide, erreur, hors-ligne, succès — 07b §12). Aucune déviation.
Les fichiers graphiques réels (SVG logo/icône/illustrations) seront produits à
l'Étape 6 avec les assets ; ces spec permettent de les créer sans ambiguïté.