# 3.4 — Design Tokens TCHATCHA

Source de vérité visuelle. Ces tokens seront traduits **tels quels** en Dart
(`mobile/packages/core/theme/`) et en CSS (web admin).

---

## 1. Couleurs

### Primaire — Vert TCHATCHA
| Token | Valeur | Usage |
|---|---|---|
| `color.primary.50` | `#E8F5EE` | fonds, chips actifs, avatars |
| `color.primary.100` | `#C8E8D6` | hover listes |
| `color.primary.300` | `#7EC4A0` | éléments décoratifs |
| `color.primary.500` | `#1B7A4D` | **action principale**, liens, focus |
| `color.primary.600` | `#14633E` | pressé, en-têtes |
| `color.primary.700` | `#0F4F31` | fonds sombres, splash |
| `color.primary.contrast` | `#FFFFFF` | texte sur primaire (contraste 4,7:1 → 6,3:1 sur 600) |

### Secondaire — Orange Soleil
| Token | Valeur | Usage |
|---|---|---|
| `color.secondary.100` | `#FFE8D8` | fonds promotions |
| `color.secondary.400` | `#FFA55C` | hover |
| `color.secondary.500` | `#FF8A3D` | **CTA secondaires**, prix, soldes |
| `color.secondary.600` | `#E6731F` | pressé |
| `color.secondary.contrast` | `#FFFFFF` | texte sur orange (contraste 4,9:1) |

### Fonctionnelles
| Token | Valeur | Usage |
|---|---|---|
| `color.success` | `#1E9E57` | succès, check, confirmations |
| `color.warning` | `#E8A31C` | attention, délais |
| `color.error` | `#D64545` | erreurs, suppressions |
| `color.error.contrast` | `#FFFFFF` | texte sur erreur (contraste 4,6:1) |
| `color.info` | `#2F6FED` | informations |

### Neutres
| Token | Valeur | Usage |
|---|---|---|
| `color.neutral.900` | `#1A1D1F` | textes principaux |
| `color.neutral.700` | `#3A4045` | textes secondaires |
| `color.neutral.500` | `#6B7280` | textes tertiaires, placeholders |
| `color.neutral.300` | `#CBD2D9` | bordures, séparateurs |
| `color.neutral.200` | `#E4E8EC` | surfaces claires |
| `color.neutral.100` | `#F1F3F5` | fonds d'inputs |
| `color.surface` | `#FFFFFF` | fonds principaux |
| `color.background` | `#F7F8FA` | fonds d'écran |
| `color.scrim` | `#1A1D1F @ 54%` | fonds de dialogues |

### Badge vérifié
| Token | Valeur |
|---|---|
| `color.verified.bg` | `#E8F5EE` |
| `color.verified.fg` | `#14633E` |
| `color.verified.icon` | `#1B7A4D` |

---

## 2. Radius

| Token | Valeur | Usage |
|---|---|---|
| `radius.xs` | 4 | petits badges |
| `radius.sm` | 8 | inputs, chips |
| `radius.md` | 12 | cards compactes, snackbars |
| `radius.lg` | 16 | **cards principales**, images |
| `radius.xl` | 24 | modales, sheets |
| `radius.pill` | 999 | boutons pilule, avatars |

## 3. Shadows

| Token | Valeur (mobile) | Usage |
|---|---|---|
| `shadow.0` | aucune | cards sur fond coloré |
| `shadow.1` | `0 1 2 rgba(26,29,31,.06)` | cartes discrètes |
| `shadow.2` | `0 2 6 rgba(26,29,31,.10)` | cartes flottantes |
| `shadow.3` | `0 8 24 rgba(26,29,31,.14)` | modales, sheets |
| `shadow.4` | `0 16 48 rgba(26,29,31,.20)` | overlays critiques |

Règle : jamais d'ombre + bordure ensemble sur un même composant.

## 4. Spacing (échelle 4 px)

| Token | Valeur | Usage |
|---|---|---|
| `space.2xs` | 4 | micro-espaces internes |
| `space.xs` | 8 | entre éléments d'un même groupe |
| `space.sm` | 12 | entre composants voisins |
| `space.md` | 16 | **espacement standard** |
| `space.lg` | 24 | groupes de sections |
| `space.xl` | 32 | sections majeures |
| `space.2xl` | 48 | marges d'écran (grands) |
| `space.3xl` | 64 | séparations de héros |

Marges latérales d'écran : `16` (mobile), `24` (tablette), `32` (desktop).
Grille : 4 colonnes (mobile), 8 (tablette), 12 (desktop) ; gouttière 16–24.

## 5. Typographie

Police d'affichage : **Outfit** (géométrique, chaleureuse) — titres.
Police de texte : **Inter** — corps. Fallback système Roboto/SF.

| Token | Taille / Ligne / Graisse | Usage |
|---|---|---|
| `type.display` | 40 / 44 / 700 | écrans de succès, splash |
| `type.title.1` | 28 / 34 / 700 | titres de page |
| `type.title.2` | 22 / 28 / 700 | titres de section |
| `type.title.3` | 18 / 24 / 600 | titres de carte |
| `type.body.lg` | 16 / 24 / 400 | corps principal |
| `type.body.md` | 14 / 20 / 400 | corps secondaire |
| `type.body.sm` | 12 / 16 / 400 | auxiliaire, légendes |
| `type.label.lg` | 16 / 20 / 600 | boutons, champs |
| `type.label.md` | 14 / 18 / 600 | onglets, chips |
| `type.label.sm` | 12 / 16 / 600 | badges, timestamps |
| `type.money` | 20 / 24 / 700 | prix (tabular-nums) |

Règles : largeur de texte ≤ 60 caractères ; pas de texte < 12 px ; prix toujours
avec chiffres tabulaires.

## 6. Animations

| Token | Valeur | Usage |
|---|---|---|
| `motion.fast` | 150 ms | hover, press, états de composant |
| `motion.normal` | 250 ms | transitions d'écran, sheets |
| `motion.slow` | 400 ms | succès, apparitions |
| `motion.ease` | `cubic-bezier(.2,0,.2,1)` | défaut |
| `motion.ease.enter` | `cubic-bezier(0,1,.2,1)` | entrées |
| `motion.ease.exit` | `cubic-bezier(.6,0,1,1)` | sorties |

Règle : animation jamais > 400 ms ; réduire pour `prefers-reduced-motion`.

## 7. Breakpoints

| Token | Valeur | Usage |
|---|---|---|
| `bp.phone` | 0–599 px | apps mobiles |
| `bp.tablet` | 600–1023 px | tablette, grandes listes |
| `bp.desktop` | 1024–1439 px | web admin, portail |
| `bp.wide` | ≥ 1440 px | grands écrans |

Zone tactile minimale : **48 × 48 px** (44 acceptable en contraintes extrêmes).

---

## 8. Format des tokens (Dart / JSON)

```json
{
  "color": { "primary": { "500": "#1B7A4D", "600": "#14633E" } },
  "radius": { "lg": 16 },
  "space": { "md": 16 },
  "type": { "body": { "lg": { "size": 16, "height": 24, "weight": 400 } } },
  "motion": { "normal": 250 }
}
```

Chaque token ici a **un seul nom, une seule valeur, un seul usage** — le système
de design (`07c`) ne fait que consommer ces tokens.
