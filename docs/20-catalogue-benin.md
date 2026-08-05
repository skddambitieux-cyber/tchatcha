# 5.4 — Catalogue initial Bénin (TCHATCHA MVP)

Version : 1.0 — Étape 5 (Lot 2). Données de lancement pour le pilote
Cotonou–Abomey-Calavi. Les catégories sont **des données, pas du code**
(Open/Closed — `06a pros.categories`) : elles sont seedées, localisées et
modifiables sans déploiement. Conventions : `slug` unique par pays, `icon_url`,
`translations` (fr + en), attributs spécifiques stockés en **configuration jsonb**
(attachés à la catégorie) et utilisés comme filtres/métadonnées de la recherche
(`search.pro_search_docs`).

---

## 1. Univers (groupes racines) — MVP

| Slug | Nom (fr) | Nom (en) | Icône | Description | Ordre |
|---|---|---|---|---|---|
| `construction` | Construction | Construction | 🧱 | Travaux, rénovation et aménagement | 1 |
| `maison` | Maison | Home services | 🏠 | Entretien, ménage et jardinage | 2 |
| `restauration` | Restauration | Restaurants | 🍽️ | Restaurants, fast-food, traiteurs | 3 |
| `numerique` | Numérique | Digital | 💻 | Informatique, graphisme et support | 4 |

> Extension P2 : `auto` (mécano, vulcanisateur, lavage), `sante`, `education`,
> `evenementiel`, `livraison` — déjà prévus arborescence (« Répertoire 2025 »).

## 2. Construction (16 sous-catégories ciblées)

### 2.1 Maçon — slug `macons`
| Champ | Valeur |
|---|---|
| Description | Gros œuvre, élévation de murs, fondations, enduits, travaux de rénovation structurelle. |
| Attributs (config) | `type_intervention` : [construction, rénovation, enduit, fondation] · `urgence` : oui/non · `zone_couverte` : km · `materiel_fourni` : oui/non/partiel |
| Filtres de recherche | urgence, zone, matériel fourni, prix/jour |

### 2.2 Carreleur — slug `carreleurs`
| Champ | Valeur |
|---|---|
| Description | Pose de carrelage et faïence, sols intérieurs/extérieurs, correction de niveau. |
| Attributs | `type_pose` : [intérieur, extérieur, faïence, sols] · `modele_pose` : [droite, diagonale, mosaïque] · `surface_min` (m²) · `travaux_preparation` : oui/non |
| Filtres | surface, type pose, zone |

### 2.3 Plombier — slug `plombiers`
| Champ | Valeur |
|---|---|
| Description | Installation et réparation de tuyauterie, sanitaires, chauffe-eau, recherche de fuites, débouchage. |
| Attributs | `type_intervention` : [installation, réparation, débouchage, fuite, sanitaire] · `urgence` : oui (URGENCE 24 h) · `zone_couverte` : km · `materiel_fourni` : oui/non |
| Filtres | urgence disponible, type intervention, matériel fourni (exemple bug.md) |

### 2.4 Électricien — slug `electriciens`
| Champ | Valeur |
|---|---|
| Description | Installation électrique, rénovation de tableaux, éclairage, dépannage, mise aux normes. |
| Attributs | `type_intervention` : [installation, dépannage, tableau, éclairage] · `habilitation` : oui/non · `urgence` : oui/non · `materiel_fourni` |
| Filtres | habilitation, urgence |

### 2.5 Peintre — slug `peintres`
| Champ | Valeur |
|---|---|
| Description | Peinture intérieure/extérieure, enduits fins, options décoratives (effets), ravalement. |
| Attributs | `surface_estimee` (m²) · `type_surface` : [intérieur, extérieur, plafond] · `finitions` : [standard, décoratif] |

### 2.6 Menuisier — slug `menuisiers`
| Champ | Valeur |
|---|---|
| Description | Fabrication et pose de meubles, portes, fenêtres, agencement bois/métal. |
| Attributs | `materiau` : [bois, métal, mélaminé] · `type_prestation` : [sur mesure, pose, réparation] · `delai` (jours) |

## 3. Maison (13 sous-catégories ciblées)

### 3.1 Femme de ménage — slug `menage`
| Champ | Valeur |
|---|---|
| Description | Ménage régulier ou ponctuel : sols, vaisselle, vitres, rangement. |
| Attributs | `frequence` : [ponctuel, hebdomadaire, mensuel] · `duree` (h) · `produits_fournis` : oui/non · `personnes` (n) |
| Filtres | fréquence, durée, produits fournis |

### 3.2 Jardinier — slug `jardiniers`
| Champ | Valeur |
|---|---|
| Description | Tonte de pelouse, taille, désherbage, plantation, entretien de cours et espaces verts. |
| Attributs | `type_travaux` : [tonte, taille, plantation, désherbage] · `surface` (m²) · `materiel_propre` : oui/non |

## 4. Restauration (14 sous-catégories ciblées)

### 4.1 Restaurants — slug `restaurants`
| Champ | Valeur |
|---|---|
| Description | Restaurants et maquis : repas sur place, à emporter et livraison dans le pilote. |
| Attributs (exemple bug.md) | `menu` : carte (jsonb) · `horaires` : ouverture/fermeture · `livraison` : [non, quartier, couloir] · `specialites` : [] · `prix_moyen` (FCFA) · `affluence` : [calme, moyenne, forte] |
| Filtres | livraison, spécialités, prix moyen, ouvert maintenant |

### 4.2 Fast-food — slug `fast-foods`
| Champ | Valeur |
|---|---|
| Description | Repas rapides : barbecues, grillades, sandwichs, poulet braisé, bâtonnets. |
| Attributs | `categories_menu` : [grillade, sandwich, poulet, bâtonnet, boissons] · `livraison` · `prix_moyen` |

### 4.3 Traiteurs — slug `traiteurs`
| Champ | Valeur |
|---|---|
| Description | Préparation de repas pour événements (mariages, cérémonies, baptêmes) et plats à emporter. |
| Attributs | `evenements` : [mariage, cérémonie, entreprise, particulier] · `capacite_min` (invités) · `reservation_requise` : oui/non |

## 5. Numérique (15 sous-catégories ciblées)

### 5.1 Informaticien / dépannage — slug `informaticiens`
| Champ | Valeur |
|---|---|
| Description | Installation, réparation PC/portables, réseaux, antivirus, sauvegarde, assistance aux particuliers et PME. |
| Attributs | `type_intervention` : [réparation, installation, réseau, support] · `distance_service` : [domicile, à distance] · `deplacement` : oui/non |
| Filtres | à distance, déplacement |

### 5.2 Graphiste — slug `graphistes`
| Champ | Valeur |
|---|---|
| Description | Logos, affiches, identité visuelle, flyers, création pour le commerce local et les réseaux sociaux. |
| Attributs | `specialites` : [logo, affiche, identité, réseaux sociaux] · `delai` (jours) · `format_sortie` : [imprimé, digital] |
| Filtres | spécialité, livraison digitale |

## 6. Règles de catalogue

| # | Règle |
|---|---|
| CAT-001 | Chaque sous-catégorie est une **feuille** (aucun enfant) ; seuls les groupes racines ont des enfants (profondeur 2). |
| CAT-002 | Attribution d'une sous-catégorie `active` : présente au seed pilote ; une désactivation ne supprime pas les pros/services existants (soft). |
| CAT-003 | Un pro peut avoir plusieurs services (plusieurs feuilles) ; un service déclaré `is_primary` pour le classement. |
| CAT-004 | Attributs spécifiques = **configuration par catégorie** (jsonb) : clés, valeurs possibles, type de filtre UI (select/toggle/multi) — mappés vers les filtres de recherche sans changement de schéma. |
| CAT-005 | Seeding idempotent (upsert sur `slug`) ; traductions fr/en au minimum (BDT). |
| CAT-006 | Les prix unitaires du service (`price_unit`) : `PER_M2` (carrelage, peinture), `PER_DAY` (maçon, ménage), `PER_HOUR` (support numérique), `PER_JOB` (débouchage), `PER_MEAL` (restauration). |

## 7. Mise en correspondance (catalogue → schéma/recherche)

| Concept catalogue | Table/colonne | Notes |
|---|---|---|
| Groupe racine | `pros.categories.parent_id NULL` | |
| Sous-catégorie feuille | `pros.categories` (parent_id → groupe) | filtre catégorie |
| Icône | `pros.categories.icon_url` | asset seed, CDN |
| Traductions | `pros.categories.translations` (jsonb) | fr/en |
| Attributs spécifiques | config jsonb par catégorie (proche de `categories` → externe `config` du module) | filtres UI + métadonnées |
| Zones couvertes pro | `pros.coverage_areas` / `pros.locations` | rayon + communes |
| Prix indicatif | `pros.profiles.min_price` / `pros.services.price_from..to` | |
| Restaurants (horaires, livraison) | `pros.business_hours`, `pros.locations`, config `livraison` | P2 : tables `food` (06c) |

**Livrable de seed attendu au démarrage du développement** : 4 racines, 15 feuilles
(ce document), ordre d'affichage, icônes, attributs — sous forme de fixtures versionnées.