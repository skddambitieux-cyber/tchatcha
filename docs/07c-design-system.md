# 3.3 — Design System TCHATCHA

Composants et règles, construits exclusivement sur les Design Tokens (`07d`).

---

## 1. Composants

### 1.1 Boutons
| Variante | Tokens | Règle |
|---|---|---|
| `Button.primary` | fond `primary.600`, texte `contrast`, radius `lg` (ou pill), hauteur 52 | Action principale par écran |
| `Button.secondary` | fond `secondary.500`, texte blanc | CTA secondaire (prix, promo) |
| `Button.outline` | bordure `neutral.300`, texte `neutral.900` | Action tertiaire |
| `Button.ghost` | texte `primary.600`, sans fond | Actions douces (voir détails) |
| `Button.danger` | fond `error`, texte blanc | Destructif (supprimer, bannir) |
| `Button.icon` | 48 × 48, radius `lg` | Actions d'en-tête |

États : `default / pressed / loading (spinner + label) / disabled (40 % opacité) / focus ring 2 px primary`.
Règle : le bouton loading **se désactive** (anti double-envoi). Hauteur min 48.

### 1.2 Cards
| Variante | Tokens | Usage |
|---|---|---|
| `Card.pro` | surface, radius `lg`, shadow.1 | résultats de recherche (photo, nom, métier, note, prix, badge) |
| `Card.info` | surface, radius `md`, shadow.1 | messages, notifications |
| `Card.quote` | fond `primary.50` ou bordure `primary.300` | devis (prix en évidence) |
| `Card.promo` | fond `secondary.100`, bordure orange | promotions, offres |

Structure de la Card.pro (standardisée) : avatar 56 px → nom (title.3) + badge
vérifié → métier (body.md) → note ★ (warning) + nombre d'avis → distance km →
prix indicatif (money, primary) → actions (appeler / chat / devis).

### 1.3 Inputs
| Élément | Règles |
|---|---|
| TextField | hauteur 52, fond `neutral.100`, radius `sm`, bordure `neutral.300` au focus, label flottant |
| PhoneInput | préfixe pays (indicatif) + champ, validation par regex |
| MoneyInput | clavier numérique, format XOF `10 000 FCFA`, tabular-nums |
| TextArea | min 3 lignes, compteur de caractères (description besoin) |
| Picker | date/heure (calendar bottom sheet), sélecteur de quartier (recherche géo) |
| Toggle | 52 × 32, `primary.500` actif |
| Checkbox | 24 × 24, radius sm |
| SearchBar | 52 px, radius pill, icône loupe, bouton filtres |

États : `default / focused / error (message sous le champ) / disabled / filled`.
Erreur : message sous le champ en `body.sm` + icône, jamais de rouge uniquement.

### 1.4 Lists
- `List.item` : hauteur min 56, padding `sm`, séparateur `neutral.200` léger.
- Pull-to-refresh systématique. Skeleton (voir États) en chargement.
- Pagination : chargement infini + indicateur ; fin de liste = "Vous avez tout vu 👌".

### 1.5 Badges & Chips
| Badge | Usage |
|---|---|
| `Badge.verified` | bouclier vert + « Vérifié TCHATCHA » (fond `verified.bg`, texte `verified.fg`) |
| `Badge.new` | « Nouveau » (fond primary.50) |
| `Badge.promo` | « -20 % » (fond secondary.100, texte secondary.600) |
| `Badge.status` | états de demande (OPEN→REVIEWED) — code couleur par état |
| `Chip.filter` | filtres actifs (fond primary.100, texte primary.700, croix) |
| `Chip.category` | catégories de l'accueil (avatar rond + libellé) |

Couleurs d'état des demandes : `OPEN` gris, `QUOTED` info, `NEGOTIATING` warning,
`SELECTED` primary, `PAID` primary, `IN_PROGRESS` info, `COMPLETED` success,
`REVIEWED` success, `CANCELLED` neutral, `EXPIRED` neutral, `DISPUTED` error.

### 1.6 Snackbars
- Succès : fond `success` ou surface + icône check verte, durée 4 s.
- Erreur : fond `error`, durée 6 s + action « Réessayer » si pertinente.
- Offline : bandeau `warning` persistant tant que la connexion est coupée.

### 1.7 Dialogs
- Fond scrim 54 %, radius `xl`, shadow.3, largeur max 400 px (mobile).
- Titre title.3 + message body.md + actions (Annuler = ghost, Confirmer = primary/danger).
- Destructif : 2 étapes si irréversible (ex. suppression de compte).

### 1.8 Bottom Sheets
- Radius supérieur `xl`, poignée visuelle 40 × 4 px, shadow.3, hauteur max 90 %.
- Scroll interne + bouton principal collé en bas (safe area).
- Catégories : liste avec sous-catégories en chips.

### 1.9 Stepper (wizards)
- Indicateur : numéros ou pastilles (fait/actif/à venir) en haut.
- Bouton principal « Continuer » (désactivé si étape invalide), « Retour » secondaire.
- Progression sauvegardée (reprendre un wizard interrompu).

### 1.10 Calendrier
- Mois + grille 7 colonnes, jours indisponibles grisés avec motif (dispo en vert),
  rendez-vous en pastille primary.
- Sélection : plage ou créneau horaire (chips d'heures).

### 1.11 Carte (MapLibre)
- Carte plein écran ou intégrée (radius `lg`), marqueur pro = pin vert (vérifié : bouclier),
  position client = pin orange, cercles de rayon de recherche.
- Popup carte → Card.pro mini (photo, nom, note, boutons).

### 1.12 En-têtes & navigation
- AppBar : titre title.1, actions icon 48, back.
- Navigation basse (app) : 4 onglets max — **Accueil · Recherche · Messages · Profil** (le client).
- Pro : **Accueil · Demandes · Planning · Revenus**.
- Badge de notifications sur l'icône.

---

## 2. États (obligatoires sur chaque écran de données)

| État | Composant | Microcopy type |
|---|---|---|
| **Loading** | Skeleton (cards aux dimensions réelles) | — |
| **Vide** | Illustration + titre + texte + CTA | « Aucun devis pour l'instant » |
| **Erreur** | Icône + message + bouton Réessayer | « Oups, un problème est survenu » |
| **Offline** | Bandeau persistant + cache lu | « Hors ligne — les données affichées datent de … » |
| **Succès** | Écran plein (display + check animé) | « Devis publié ! » |
| **Rafraîchir** | Pull-to-refresh | — |

---

## 3. Accessibilité

| Exigence | Règle |
|---|---|
| Contraste | AA minimum (4,5:1 texte normal, 3:1 grand texte/UI) — vérifié sur chaque token |
| Cible tactile | ≥ 48 × 48 px ; espacement entre cibles ≥ 8 px |
| Focus | Focus ring visible 2 px `primary.500` (clavier web) |
| Lecteurs d'écran | `Semantics` sur les icônes (label), images décoratives marquées, ordre logique |
| Réduction de mouvement | `prefers-reduced-motion` : animations coupées ou réduites |
| Grands textes | Layouts fluides jusqu'à 200 % de zoom, pas de coupures |
| Couleur seule | Jamais d'information portée par la couleur seule (icônes + libellés) |
| Formulaires | `label` lié à chaque champ, erreurs énoncées, autocomplete mobile |

---

## 4. Règles de composition

1. Un écran = **une action principale** (1 bouton primary maximum).
2. Hiérarchie : titre → contenu → action (F-pattern sur les fiches).
3. Les informations de confiance (badge, note, missions) sont **toujours visibles**
   sans scroll dans une fiche pro.
4. Prix toujours en `money` (XOF, tabular-nums) avec unité.
5. Espacement uniquement via tokens ; jamais de marges arbitraires.
6. Icônes cohérentes (Material Symbols outline, trait 2 px).
7. Dark mode : prévu via tokens (phase ultérieure, tokens déjà nommés pour).
