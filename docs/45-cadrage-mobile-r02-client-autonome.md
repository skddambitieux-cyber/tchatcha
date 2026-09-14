# Cadrage technique mobile R-02 — parcours Client autonome

Version : 1.0 — cadrage de préparation, 13 septembre 2026
Périmètre : application Flutter Android, client authentifié, zones Cotonou et Abomey-Calavi.

Ce document décrit le parcours livrable et ses contrats réels. Il ne crée pas
de nouveau endpoint et ne vaut pas spécification de l'inscription
professionnelle. Les références d'implémentation citées ont été vérifiées dans
`backend/apps/api/src` et les E2E associés.

## 1. Décisions de périmètre

- R-01 reste le socle : OTP LOGIN et inscription CLIENT uniquement.
- R-02 est un parcours Client autonome : choisir une zone, un métier, chercher
  un professionnel, consulter sa fiche, publier et suivre une demande.
- Le professionnel peut être consulté publiquement, mais son inscription et sa
  gestion de vitrine sont hors lot.
- Aucun Journal TCHATCHA, publicité, paiement, devis, réservation, messagerie,
  notification ou litige dans R-02. Ces fonctions restent des dépendances
  futures du parcours complet.
- L'interface est en français et doit rester utilisable sur petits écrans
  Android. Aucun UUID n'est saisi par l'utilisateur ; les UUID sont des valeurs
  de navigation ou des identifiants internes reçus de l'API.
- `API_URL` reste fourni par `--dart-define`. Aucune URL de production ne doit
  être ajoutée au code ou aux fixtures.

## 2. Contrat commun mobile/API

Base locale de développement : `API_URL` + `/api/v1`. Chaque erreur est
présentée par un message français générique et un code métier journalisé côté
application, sans URL, stack, secret, téléphone ou réponse brute.

Pour les routes protégées, le client envoie `Authorization: Bearer
<access_token>`. Les opérations d'écriture idempotentes envoient une clé UUID
dans `Idempotency-Key`. Les listes utilisent `limit` et `cursor`, et le client
ne fabrique ni ne modifie le curseur opaque.

### Session et rafraîchissement

Le backend expose :

| Endpoint | Auth | Contrat réel | Réponse |
|---|---|---|---|
| `POST /auth/login` | non | `{country_code, phone, code, device?}` | `200 {access_token, refresh_token, user}` |
| `POST /auth/refresh` | non, avec refresh valide | `{refresh_token, device?}` | `200` nouvelle paire de tokens ; rotation de l'ancien refresh |
| `POST /auth/logout` | Bearer | `{refresh_token}` | `204` |
| `POST /auth/logout-all` | Bearer | aucun corps | `204` |
| `GET /me` | Bearer | aucun paramètre | `200 UserMe` |

Le stockage local R-02 doit utiliser le mécanisme sécurisé natif Android
(Keystore via un plugin Flutter validé), jamais `SharedPreferences` en clair,
logs, analytics ou paramètres de navigation. Au démarrage : lire les tokens,
appeler une route protégée ; sur `401`, tenter une seule rotation atomique du
refresh, remplacer les deux tokens, rejouer la requête une fois, puis revenir à
LOGIN et effacer la session si la rotation échoue. Le logout efface toujours le
stockage local après la tentative serveur.

Le client implémente un **single-flight refresh** : un seul `POST /auth/refresh`
peut être en vol par session. Les autres requêtes qui reçoivent simultanément
`401` attendent le même résultat ; elles rejouent une fois avec la nouvelle paire
ou échouent toutes ensemble et déclenchent un seul retour à LOGIN. Un refresh
arrivé après logout ne doit jamais réécrire la session. La session doit être
couverte par des tests de concurrence 401, rotation, expiration, réutilisation
du refresh, logout et absence de tokens dans logs/erreurs.

### Architecture Flutter obligatoire pour R-02A

Le scaffold R-01 concentre encore le flux dans `mobile/lib/main.dart`. R-02A
doit le découper avant d'ajouter des écrans :

```text
lib/
  app/             bootstrap, routes, thème, localisation française
  core/api/        client HTTP, erreurs rédigées, sérialisation
  core/session/    SessionStore sécurisé, AuthInterceptor, single-flight
  features/home/   accueil, géographie, catégories
  features/shared/ modèles et widgets réutilisables
test/              unitaires, widgets et contrats avec fake API
```

Les écrans ne connaissent ni `HttpClient`, ni stockage sécurisé, ni UUID
techniques. Les interfaces `ApiClient`, `SecureSessionStore` et horloge doivent
être injectables afin que les tests n'aient besoin ni d'un téléphone, ni d'une
API distante, ni de Supabase. La navigation peut rester celle de Flutter SDK
pour R-02A ; aucun package d'état ou de navigation n'est requis à ce stade.

### Dépendances R-02A à figer

La base R-01 ne déclare actuellement aucune dépendance applicative. Ajouter
uniquement, après validation dans une CI utilisant Flutter 3.47.2 :

| Package | Usage | Règle |
|---|---|---|
| `http` | transport HTTP injectable et testable | pas d'URL dans les écrans |
| `flutter_secure_storage` | access/refresh tokens dans Android Keystore | jamais de fallback en clair |
| `uuid` | `Idempotency-Key` côté demande | UUID généré localement, non affiché |

`connectivity_plus` est facultatif : il peut alimenter un indicateur réseau,
mais la décision fiable reste le résultat HTTP. `provider`, `go_router`, une
base locale et tout plugin de localisation sont reportés tant qu'un besoin
R-02A testable n'est pas démontré. Les versions exactes doivent être verrouillées
dans `pubspec.lock` par CI/Flutter 3.47.2 ; toute incompatibilité doit bloquer
le lot, pas être contournée par une dépendance transitive non auditée.

## 3. Parcours et contrats par écran

### 3.1 Accueil Client

L'accueil n'a pas d'endpoint dédié. Il compose `GET /geo/countries`,
`GET /geo/countries/BJ/divisions?type=COMMUNE` et `GET /categories?country_code=BJ`.
Il affiche une recherche texte, les deux communes du pilote et les métiers
réels retournés par l'API. Une session n'est pas requise pour consulter le
catalogue ; une session valide est requise avant de publier une demande.

États : skeleton séparé par bloc, vide si aucune catégorie/commune, erreur
réessayable par bloc, écran hors connexion avec dernière copie locale datée.
Les données locales nécessaires sont uniquement les libellés de fallback
`Cotonou`, `Abomey-Calavi`, le pays `BJ` et les catégories issues d'un snapshot
de test non sensible.

### 3.2 Sélection de commune

`GET /geo/countries/BJ/divisions?type=COMMUNE` retourne
`{items: [{id, country_code, parent_id, type, name, name_translations, depth}]}`.
La liste filtre les communes actives reçues (attendues : Cotonou et
Abomey-Calavi) et conserve en mémoire l'`id` choisi. Endpoint public, pas de
payload. Une commune sans résultat doit rester sélectionnable et conduire à
l'état vide de recherche.

Il n'existe pas d'endpoint localité séparé dans le backend vérifié. R-02 utilise
donc `division_id` de la commune. Toute granularité quartier/localité devra
faire l'objet d'un contrat API séparé.

### 3.3 Catégories de métiers

`GET /categories?country_code=BJ` retourne
`{items: [{id, parent_id, country_code, name, slug, icon_url, sort_order, translations}]}`.
L'interface regroupe les catégories par `parent_id`, masque les entrées
inactives déjà filtrées serveur et transmet l'UUID de la feuille sélectionnée.
Les données attendues viennent du seed catalogue Bénin ; aucune liste codée en
dur ne doit remplacer la réponse serveur.

Endpoint public, pas de payload. États : chargement, vide explicite (« Aucun
métier disponible »), erreur réessayable, mode hors connexion sur cache
versionné. `icon_url` est facultatif et doit être chargé avec timeout et image
de remplacement.

### 3.4 Recherche et filtres

`GET /search` est public. Paramètres exacts :

`q` (1–100), `country_code` (défaut `BJ`), `category_id` UUID,
`division_id` UUID, couple `lat`/`lon`, `radius_km` (1–50), `verified`,
`min_rating` (0–5), `min_price`/`max_price` (≥ 0), `sort` parmi
`relevance|distance|rating|price`, `limit` (1–50, défaut 20) et `cursor` opaque.

Le mobile ne transmet les coordonnées que si les deux sont connues. Sans
coordonnées, le tri par défaut est `rating` ; `distance` exige le couple de
coordonnées et `relevance` exige `q`. La réponse est
`{items: [projection publique], next_cursor: string|null}`.

La projection publique vérifiée expose notamment `business_name`, statut,
note/compteurs, vérification, prix minimal, catégorie, zone et
`distance_km` selon le cas. Elle ne doit jamais afficher `user_id`, téléphone,
email, adresse exacte, latitude/longitude ou clé de stockage. Pagination :
append sans doublon, loading initial et suivant, vide, erreur avec retry et
hors connexion en lecture du dernier résultat.

Filtres R-02 : commune, catégorie, vérifié, note minimale, fourchette de prix,
tri. Un changement de filtre remet le curseur à zéro. Aucun moteur de tri local
ne doit contredire le serveur.

### 3.5 Fiche professionnelle

`GET /professionals/:id` est public et prend l'identifiant reçu par navigation.
La réponse est la projection publique du professionnel, vérifiée par
`public-catalogue-geo.e2e-spec.ts` : identité de vitrine, `verified`, données de
réputation publiques, `location.division_name` et `service_radius_km`, services
et portfolio. Les données personnelles exactes et les clés S3 sont exclues.

La fiche affiche badge, nom commercial, description, métiers/services, prix
indicatifs, zone générale, note et réalisations. Elle ne révèle aucun contact
direct. États : skeleton, 404 (« Professionnel indisponible »), erreur réseau,
hors connexion si la fiche est déjà en cache, et contenu vide pour portfolio ou
avis absents.

Les avis ne sont pas nécessaires à la première coupe R-02 ; l'endpoint existant
`GET /professionals/:id/reviews` pourra être ajouté en R-02B uniquement après
validation de son contrat de pagination et de modération.

### 3.6 Création d'une demande

`POST /requests` exige Bearer, un Client actif et un UUID `Idempotency-Key`.
Payload exact :

```json
{
  "category_id": "<uuid categorie feuille>",
  "title": "Réparer une fuite",
  "description": "Description de 1 à 2000 caractères",
  "budget_min": 5000,
  "budget_max": 15000,
  "desired_date": "2026-10-01T09:00:00.000Z",
  "urgency": "NORMAL",
  "location": {
    "division_id": "<uuid commune>",
    "lat": 6.37,
    "lon": 2.42
  }
}
```

`category_id`, `title`, `description` et `location` sont obligatoires ;
`location.division_id` est obligatoire côté service, les coordonnées sont
optionnelles mais doivent être présentes ensemble. `urgency` vaut
`LOW|NORMAL|HIGH|EMERGENCY`. Le serveur vérifie la date future et l'ordre du
budget. La réponse est le résultat de publication (projection de la demande,
à typer sur fixture/E2E avant l'UI finale).

États : validation locale avant réseau, bouton verrouillé, succès vers le
détail, erreur métier (`division_required`, `invalid_budget`,
`desired_date_in_past`, `idempotency_key_required`), erreur générique et file
hors connexion explicitement refusée en R-02 (pas de publication différée sans
contrat d'idempotence persistant). Aucun brouillon ne contient de secret.

### 3.7 Liste et détail des demandes

Les deux routes exigent Bearer et ne retournent que les demandes du Client :

| Endpoint | Paramètres | Réponse/usage |
|---|---|---|
| `GET /requests?limit=20&cursor=<opaque>` | `limit` 1–50, curseur optionnel | `{items, next_cursor}` ; pagination keyset |
| `GET /requests/:id` | UUID reçu de l'API | détail propriétaire, 404 pour un autre Client |
| `POST /requests/:id/cancel` | `{reason, version}` | annulation si transition autorisée |

La liste affiche statut, titre, catégorie, commune, date souhaitée, budget et
date de création. Le détail affiche la description, localisation générale,
urgence, statut, devis éventuels seulement si leur contrat est validé dans un
lot ultérieur. R-02 ne permet ni devis, ni sélection, ni paiement.

États : chargement initial/suivant, vide (« Vous n'avez pas encore publié de
demande »), erreur retry, hors connexion en lecture du cache ; le cache local
doit indiquer sa date et ne jamais être présenté comme à jour. Les mutations
sont désactivées hors connexion.

## 4. Disponibilité des endpoints

### Disponibles et utilisables en R-02

- Session : `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`,
  `/me`.
- Géographie : `/geo/countries`, `/geo/countries/:code/divisions`.
- Catalogue : `/categories`.
- Recherche : `/search`.
- Fiche : `/professionals/:id`.
- Demandes Client : `POST /requests`, `GET /requests`, `GET /requests/:id`.

### Disponibles mais hors R-02

`/requests/:id/cancel`, `/requests/:id/quotes`, `/quotes/*`,
`/professionals/:id/slots`, `/bookings/*`, `/payments/*`, `/disputes/*`,
`/reviews/*`, médias, messagerie et notifications. Ils ne doivent pas être
appelés par les écrans R-02A/B/C.

### Manquants ou à clarifier avant extension

- aucun endpoint dédié à l'accueil, aux favoris, à la liste de quartiers ou à
  la disponibilité du professionnel dans le parcours R-02 ;
- aucun endpoint mobile de notifications ou de messagerie opérationnel, malgré
  leur présence dans certains contrats documentaires ;
- contrat de réponse détaillé de `POST /requests` à figer dans un E2E/DTO de
  lecture avant de générer les modèles Flutter ;
- stratégie de cache et version des catégories/zones à décider ;
- état de session côté application Flutter à construire : R-01 ne persiste pas
  encore de tokens ; il faut aussi une file single-flight pour les 401
  simultanés.

## 5. Contradictions documentaires et décisions

1. `docs/44-readiness-pilote.md` décrit le mobile comme absent, alors que le
   commit R-01 `b577c94` livre désormais le scaffold Flutter LOGIN/REGISTER.
   Décision : considérer R-01 livré, mais conserver les réserves de readiness
   sur le raccordement réel et les données pilote.
2. `docs/24-prototype-interactif.md` décrit un parcours Client complet incluant
   devis, réservation, paiement et avis. Ces écrans ne sont pas R-02.
   Décision : limiter R-02 aux huit capacités de ce cadrage ; reporter le reste
   sans afficher de faux parcours.
3. Les contrats d'inscription backend acceptent PROFESSIONAL et des UUID,
   tandis que R-01 mobile les exclut volontairement. Décision : le mobile R-02
   ne réutilise pas ces champs et ne propose aucune inscription pro.
4. Les règles parlent de localité, mais l'API géographie exposée fournit ici
   des divisions, dont les communes. Décision : employer `division_id` pour
   Cotonou/Abomey-Calavi et demander un contrat localité avant toute extension.
5. Le blueprint mentionne notifications, conversations et favoris, mais leurs
   contrôleurs ne sont pas présents dans la version examinée. Décision : aucune
   dépendance à ces fonctions dans R-02.

Décisions produit nécessaires avant développement : validation du cache hors
connexion, politique d'autorisation de localisation, durée de conservation
locale des demandes, forme exacte de la réponse de publication, et choix du
plugin de stockage sécurisé compatible Android.

## 6. Découpage sûr

### R-02A — socle et découverte (seul lot implémentable immédiatement)

Architecture Flutter par couches (API, modèles, stockage sécurisé, état,
navigation), session/refresh/logout avec single-flight, thème français conforme
à l'identité 22, accueil, communes et catégories. Critère de sortie : un Client
peut ouvrir la session, restaurer/rafraîchir la session et choisir une commune et
une catégorie réelles, avec états réseau testés, sans dépendre d'un appareil.
R-02A ne lance aucune recherche, fiche ou publication tant que ces contrats et
tests de session ne sont pas verts.

### R-02B — recherche et fiche (après sortie R-02A)

Client HTTP de recherche, filtres et pagination opaque, cartes de résultats,
fiche publique et cache de lecture. Critère de sortie : recherche par métier et
commune affiche uniquement la projection publique, sans PII ni coordonnées
exactes, avec 404/vide/hors connexion testés.

### R-02C — demande et suivi (après sortie R-02B)

Formulaire validé localement, génération de clé d'idempotence, publication,
liste et détail des demandes, cache de lecture, erreurs métier assainies. Aucun
devis/paiement/réservation. Critère de sortie : publication unique malgré un
retry, navigation vers détail, pagination, et contrôle visuel unique sur
téléphone réel à la fin du lot sauf blocage majeur.

## 7. Critères d'acceptation R-02

- Une session valide est restaurée sans exposer de token ; un access token
  expiré est rafraîchi une seule fois puis la requête est rejouée.
- Plusieurs `401` simultanés partagent un seul refresh ; aucun appel concurrent
  ne réutilise l'ancien refresh et le logout gagne contre un refresh tardif.
- Une session invalide revient proprement à LOGIN et efface les secrets locaux.
- Les seules communes proposées par le scénario pilote sont Cotonou et
  Abomey-Calavi, provenant de l'API.
- Les catégories affichées proviennent de `/categories`, sans UUID saisi.
- Les filtres utilisent exactement les paramètres de `/search` et paginent
  sans doublon.
- Une fiche publique n'expose aucune PII, adresse exacte, position ou clé S3.
- Une demande valide est publiée avec une clé d'idempotence UUID et un retry
  ne crée pas de doublon.
- Les demandes listées et détaillées appartiennent uniquement au Client
  connecté.
- Chaque écran possède loading, vide, erreur et comportement hors connexion
  documentés ; les écritures hors connexion sont refusées explicitement.
- Aucun paiement, Journal TCHATCHA, publicité, onboarding professionnel ou URL
  de production n'est présent dans R-02.

## 8. Matrice de tests

| Domaine | Tests unitaires | Widget | Intégration/E2E |
|---|---|---|---|
| Session | parsing tokens, expiration, rotation, effacement, single-flight | splash, retry 401 simultanés, logout | `/auth/refresh` rotation et refresh réutilisé rejeté |
| Accueil/geo | mapping items, cache expiré, communes | skeleton, vide, retry, hors ligne | `/geo/countries` et divisions du pilote |
| Catégories | arbre `parent_id`, tri serveur | sélection feuille, erreur | `/categories?country_code=BJ` |
| Recherche | encodage query, règles couple lat/lon, curseur | filtres, pagination, vide | recherche texte, commune, prix, vérifié, projection PII |
| Fiche | mapping nullable, image fallback | skeleton, 404, portfolio vide | projection publique et absence PII |
| Demande | validations titre/description/budget/date, UUID idempotence | formulaire, bouton verrouillé, erreurs métier | publication Client, retry idempotent, non-Client refusé |
| Mes demandes | mapping statuts, curseur | liste vide, détail, cache daté | isolation propriétaire, détail 404 autre Client |
| Sécurité UX | redaction des exceptions et tokens | aucun token/OTP dans l'écran ou logs | headers Bearer, 401/403, aucune donnée sensible |

## 9. Données de démonstration requises

Jeu contrôlé et non personnel : pays `BJ`, communes actives Cotonou et
Abomey-Calavi, catégories feuille réalistes (par exemple plomberie,
électricité, maçonnerie, ménage) avec traductions françaises, au moins trois
professionnels actifs répartis dans les deux communes, projections publiques
avec profils vérifiés/non vérifiés et prix indicatifs, et deux demandes Client
de test avec statuts distincts. Les UUID sont générés par les migrations ou le
seed et injectés dans les fixtures ; ils ne sont jamais demandés à un testeur.

Les téléphones, OTP, tokens, adresses exactes, coordonnées personnelles,
emails, secrets et clés de stockage doivent être générés uniquement par les
tests ou un environnement local isolé. Toute fixture doit utiliser des valeurs
fictives et être réinitialisable. Les tests d'intégration locaux ciblent
exclusivement la base `tchatcha_e2e` ; aucune base de production, de pilote ou
Supabase n'est une dépendance de la suite mobile. La validation terrain BV4800
doit se limiter à un compte de démonstration contrôlé et à un seul contrôle
visuel en fin de R-02C.

## 10. Traçabilité des sources vérifiées

- Identité et composants : `docs/22-identite-visuelle.md`.
- Parcours et états UX : `docs/24-prototype-interactif.md` et maquettes Client.
- Readiness et limites réelles : `docs/44-readiness-pilote.md`.
- Contrats et règles : `docs/08-specification-fonctionnelle.md`,
  `docs/12-api-blueprint.md`, `docs/19-business-rules.md`.
- Implémentation et preuves : contrôleurs/DTO des modules `auth`, `geo`,
  `professionals`, `search`, `market`, et E2E `auth`, `search`,
  `professionals/public-catalogue-geo`, `market/requests`.
