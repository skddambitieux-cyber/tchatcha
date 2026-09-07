# Cadrage contractuel — Lot FCT-016A : avis multi-critères

> Document préparatoire avant implémentation. Ce lot couvre la création, la
> consultation publique et les agrégats de notes. La réponse professionnelle,
> le signalement, la modération et le Trust Score sont reportés à FCT-016B.

## 1. Sources et décisions structurantes

Sources consultées : `08-specification-fonctionnelle.md`, `12-api-blueprint.md`,
`06-schema-base.md`, `06b-tables-mvp-market.md`, `06d-revue-schema.md`,
`19-business-rules.md`, le squelette `review.entity.ts`, les migrations `001`
et `013`, et le contrat FCT-014.

Le schéma `review.reviews` est déjà créé par `001-initial-schema.ts` avec les
cinq notes, `uq_reviews_booking` et les index de lecture. La prochaine
migration est donc **014-review-creation** : elle ajoute l’idempotence, le
marquage tardif et les agrégats multi-critères sans recréer la table.

### Contradictions retenues

| Sujet | Contradiction | Décision FCT-016A |
|---|---|---|
| Idempotence | `12-api-blueprint.md` indique 24 h/Redis et une relecture `200`, alors que la convention de création est `201` + `Location` | clé UUID obligatoire, empreinte et snapshot persistés en base ; replay retourne le même `201` et le même corps |
| Publication | `review.reviews.status` prévoit `PENDING`, mais la modération est FCT-016B | création en `APPROVED` dans A ; aucun filtre de modération n’est appliqué avant B, qui introduira le workflow sans changer l’auteur autorisé |
| Fin de prestation | le booking ne possède pas `completed_at` | date de référence = `GREATEST(client_confirmed_at, pro_confirmed_at)` ; les deux valeurs sont obligatoires lorsque le booking est `COMPLETED` |
| Avis/photos | `review_photos` est supprimée au profit de `media.files` | les `media_ids` désignent des fichiers `READY`, `purpose=REVIEW_PHOTO`; ils sont rattachés au nouvel avis dans la même transaction |
| état booking | l’ancienne machine mentionne `REVIEWED`, mais le code FCT-014 ne matérialise pas cette transition | FCT-016A ne change pas l’état du booking ; l’unicité de `review.booking_id` suffit |

## 2. Périmètre

Inclus :

- `POST /api/v1/reviews` ;
- `GET /api/v1/professionals/:id/reviews` ;
- cinq notes obligatoires de 1 à 5 : générale, ponctualité, qualité, rapport
  qualité/prix et politesse ;
- commentaire facultatif de 1 000 caractères maximum ;
- au plus cinq médias ;
- client du booking uniquement, booking `COMPLETED`, un avis par booking ;
- idempotence et sérialisation de deux créations concurrentes ;
- `is_late` lorsque la création intervient strictement plus de 30 jours après
  la date de fin retenue ;
- agrégats fiables par professionnel et par critère.

Hors périmètre : modification/suppression, réponse du professionnel,
signalement, file de modération, décision admin, helpful votes, notifications
effectives, recalcul du Trust Score et changement de l’état du booking.

## 3. Contrat API

Préfixe global : `/api/v1`. Toutes les dates sont ISO-8601 UTC.

### 3.1 Création

`POST /reviews`, authentification Bearer et header obligatoire
`Idempotency-Key: <UUID>`.

```json
{
  "booking_id": "<uuid>",
  "rating": 5,
  "punctuality": 4,
  "quality": 5,
  "price_ratio": 4,
  "politeness": 5,
  "comment": "Très bonne prestation.",
  "media_ids": ["<uuid>"]
}
```

`comment` est trimé, stocké en texte brut et peut être nul. `media_ids` est
facultatif, dédoublonné après validation et limité à cinq UUID.

Réponse `201 Created`, avec `Location: /api/v1/reviews/:id` :

```json
{
  "id": "<uuid>",
  "booking_id": "<uuid>",
  "rating": 5,
  "punctuality": 4,
  "quality": 5,
  "price_ratio": 4,
  "politeness": 5,
  "comment": "Très bonne prestation.",
  "media_ids": ["<uuid>"],
  "is_late": false,
  "status": "APPROVED",
  "created_at": "<ISO-8601 UTC>",
  "updated_at": "<ISO-8601 UTC>"
}
```

Même acteur, route et clé avec le même body canonique : même `201`, même
snapshot, aucun nouvel avis et aucun second recalcul. Même clé avec un body
différent : `409 idempotency_mismatch`. Une nouvelle clé après création :
`409 review_already_exists`.

### 3.2 Consultation publique

`GET /professionals/:id/reviews?limit=20&cursor=<opaque>` est public.
`limit` vaut 20 par défaut et 100 au maximum. La réponse suit l’enveloppe
commune :

```json
{
  "data": [{
    "id": "<uuid>", "rating": 5, "punctuality": 4, "quality": 5,
    "price_ratio": 4, "politeness": 5, "comment": "…",
    "media_ids": [], "is_late": false, "created_at": "<ISO-8601 UTC>"
  }],
  "pagination": { "next_cursor": "<opaque|null>", "has_more": false,
    "total_estimate": null },
  "averages": {
    "rating": 4.7, "punctuality": 4.5, "quality": 4.8,
    "price_ratio": 4.4, "politeness": 4.9, "count": 12
  }
}
```

Seuls les avis `APPROVED` et non supprimés sont exposés. Tri stable :
`created_at DESC, id DESC`; pagination keyset, jamais OFFSET. Un professionnel
inconnu renvoie `404 professional_not_found`, sans révéler l’existence d’avis.

## 4. Autorisations et erreurs non-divulgantes

Le reviewer doit être `bookings.client_id`. Le professionnel, un admin et un
autre client ne peuvent pas créer d’avis. L’avis ne peut viser que le
`professional_id` du booking ; ces valeurs sont lues depuis le booking, jamais
acceptées dans le body.

| Situation | HTTP | Code |
|---|---:|---|
| JWT absent/invalide | 401 | `unauthorized` |
| DTO, UUID, note ou commentaire invalide | 400/422 | `validation_failed` |
| booking inconnu ou non accessible | 404 | `booking_not_found` |
| acteur non client du booking | 403 | `forbidden` |
| booking autre que `COMPLETED` | 409 | `review_booking_invalid_state` |
| avis déjà existant | 409 | `review_already_exists` |
| clé réutilisée avec body différent | 409 | `idempotency_mismatch` |
| média absent/non autorisé/non prêt | 404 | `review_media_not_found` |
| conflit concurrent non rejouable | 409 | `version_conflict` |

Pour éviter l’énumération, un booking absent et un booking appartenant à un
tiers sont traités comme `404` avant toute information sur son professionnel.

## 5. Modèle de données et migration 014

`review.reviews` reste la source de vérité : `booking_id`, `request_id`,
`reviewer_id`, `reviewee_id`, les cinq `smallint`, `comment`, `status`, dates et
`deleted_at`. La migration 014 ajoute :

```text
is_late boolean NOT NULL DEFAULT false
idempotency_key uuid NULL
request_hash char(64) NULL
response_snapshot jsonb NULL
```

Contraintes/index :

- `CHECK` sur chacune des cinq notes `BETWEEN 1 AND 5` (déjà présent, à
  vérifier par la migration) ;
- `CHECK (char_length(comment) <= 1000)` avec commentaire nul autorisé ;
- index unique partiel `(reviewer_id, idempotency_key)` lorsque la clé n’est
  pas nulle ;
- `uq_reviews_booking` reste la protection finale d’un seul avis par booking ;
- index public couvrant `(reviewee_id, status, created_at DESC, id DESC)`.

Les médias restent dans `media.files` : `owner_type=REVIEW`,
`owner_id=review.id`, `purpose=REVIEW_PHOTO`, `status=READY`. Ils ne sont pas
copiés dans une table `review_photos` et leurs URL ne sont jamais acceptées par
le DTO.

Pour rendre les cinq moyennes persistées et atomiques, 014 crée
`review.professional_review_stats` : `professional_id` PK/FK,
`rating_avg`, `punctuality_avg`, `quality_avg`, `price_ratio_avg`,
`politeness_avg`, `updated_at`. Le compteur est recalculé depuis
`review.reviews` à chaque lecture et n’est pas dénormalisé dans cette table.
Les moyennes sont `numeric(4,3)` en stockage et
arrondies à une décimale dans l’API. `pros.profiles.rating_avg` et
`rating_count` sont synchronisés dans la même transaction pour préserver les
lecteurs existants et la projection search. `pros.reputation`/Trust Score est
reporté à B.

## 6. Transaction, verrous et concurrence

La création exécute une seule transaction :

1. verrouiller `market.bookings` par `SELECT ... FOR UPDATE` ;
2. vérifier existence, client, `COMPLETED`, `request_id` et
   `professional_id` ;
3. verrouiller `pros.profiles` du professionnel ;
4. vérifier la clé d’idempotence et l’avis existant ;
5. vérifier les médias `READY`, appartenant au client et non déjà attachés ;
6. insérer l’avis avec `is_late = now() > completion_date + interval '30 days'` ;
7. rattacher les médias ;
8. recalculer les cinq `AVG` sur les avis `APPROVED` non supprimés ;
9. mettre à jour `review.professional_review_stats`, `pros.profiles` et
   l’outbox/événement d’agrégat dans la même transaction ;
10. écrire le snapshot de réponse puis commit.

L’ordre obligatoire est donc **booking → profile → review/stats**. Les lecteurs
publics ne prennent pas ces verrous. Deux créations pour le même booking sont
sérialisées par le verrou booking puis protégées par `uq_reviews_booking` ; une
seule réussit, l’autre retourne `409` ou le replay idempotent approprié.

La date de fin retenue est précisément :
`GREATEST(client_confirmed_at, pro_confirmed_at)`. Elle représente la seconde
confirmation, seule date persistée qui déclenche la transition vers
`COMPLETED`; `scheduled_end`, `updated_at` et l’heure d’insertion de l’avis ne
sont pas utilisés pour le délai de 30 jours.

## 7. Calcul des moyennes

Le recalcul complet dans la transaction est retenu pour A : il est exact lors
d’une création, résiste aux suppressions/modérations futures et évite les
erreurs d’arrondi d’un incrémental. La requête agrège uniquement les avis
`APPROVED` et `deleted_at IS NULL`; zéro avis donne `count=0` et des moyennes
nulles dans les statistiques, tandis que les profils historiques conservent
leurs valeurs de compatibilité à zéro si nécessaire.

FCT-016B réutilisera le même recalcul après décision de modération, sans
introduire une seconde formule.

## 8. Matrice de tests

### Unitaires

U01 DTO complet ; U02 notes absentes, non entières, hors 1..5 ; U03 commentaire
vide/>1000 ; U04 plus de cinq médias/doublons ; U05 client autorisé ; U06 pro,
admin et tiers refusés ; U07 booking non `COMPLETED` ; U08 avis tardif à J+30 et
J+30+1s ; U09 date basée sur la seconde confirmation ; U10 idempotence exacte ;
U11 mismatch ; U12 nouvel avis déjà existant ; U13 recalcul des cinq moyennes ;
U14 sérialisation des erreurs et réponse sans données sensibles.

### Repository/intégration

R01 migration up/down et contraintes ; R02 rollback après média ou agrégat ;
R03 verrou booking puis profile ; R04 deux insertions concurrentes ; R05
snapshot stable ; R06 rattachement média atomique ; R07 agrégats exacts après
plusieurs avis ; R08 pagination keyset stable ; R09 exclusion des avis
supprimés/non approuvés ; R10 synchronisation profile/statistiques.

### E2E

E01 création client sur booking complété ; E02 refus booking non complété ; E03
non-client/admin/pro refusés ; E04 validation des limites ; E05 replay et
mismatch d’idempotence ; E06 double POST concurrent ; E07 liste publique,
pagination et curseur ; E08 moyennes des cinq critères ; E09 avis tardif ; E10
booking/professionnel inconnus non-divulgants ; E11 média valide/invalide.

## 9. Report explicite à FCT-016B

Sont volontairement absents de ce lot : `PUT/PATCH /reviews/:id`, réponse
professionnelle (`POST /reviews/:id/respond`), signalement
(`POST /reviews/:id/report`), transitions `PENDING/FLAGGED/REJECTED`, file et
décisions admin, helpful votes, notifications, pénalités et recalcul du Trust
Score. B devra conserver l’unicité, le même ordre de verrous, la même source de
date et le même service de recalcul.
