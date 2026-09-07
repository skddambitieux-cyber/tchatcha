# Cadrage contractuel — Lot FCT-015 : litige (`POST /disputes`)

> Document de cadrage avant implémentation. Aucun code applicatif n’est modifié
> par ce livrable.
>
> Périmètre : ouverture et lecture d’un litige sur une prestation payée, gel de
> la finalisation financière, preuves facultatives, idempotence de création et
> contrôle d’accès client/pro/admin. L’arbitrage, les remboursements effectifs,
> les notifications réelles et les sanctions sont reportés à FCT-025.

Sources : `08-specification-fonctionnelle.md` (FCT-015, US-035, SCR-030) ;
`12-api-blueprint.md` (FCT-015, idempotence REST) ; `06-schema-base.md` §10 et
§13 (états et migrations) ; `06b-tables-mvp-market.md` (market.disputes,
media.files, provider_operations) ; `19-business-rules.md` BR-100..105 et
BR-110..112 ; `07k-wireframes-restants.md` SCR-030/WIZ-006 ;
`10-blueprint-backend.md` MOD-07 ; `15-securite.md` (RBAC, audit, T07) ;
`39-cadrage-market-fct-014.md` (verrous booking et frontière de paiement).

---

## 1. Objectif et périmètre

US-035 permet à un client ou à un professionnel de signaler un problème sur
une prestation payée : travail non conforme, travail non terminé, retard/non
venue, problème de paiement ou autre motif. L’ouverture place le booking dans
`DISPUTED` et empêche toute finalisation financière concurrente.

### Inclus

- `POST /api/v1/disputes` ;
- `GET /api/v1/disputes/:id` ;
- motifs contrôlés, description et références de preuves ;
- participation client/pro et lecture admin ;
- idempotence de création par `Idempotency-Key` ;
- transition atomique `IN_PROGRESS → DISPUTED` ;
- réservation de la concurrence avec FCT-014 ;
- audit/outbox contractuel de l’ouverture, si l’adaptateur est disponible ;
- tests unitaires, repository et E2E ciblés.

### Hors périmètre

- arbitrage admin et écran SCR-124 ;
- décision `RESOLVED`/`REJECTED` ;
- remboursement, libération au pro ou compromis financier ;
- calcul de commission ou modification de `pay.commissions` ;
- notifications SMS/push effectives ;
- pénalités Trust Score, limitation des retraits et OTP renforcé ;
- upload de fichiers : FCT-015 ne reçoit que des `media_ids` déjà créés.

---

## 2. Décisions sur les états de booking

### État autorisé

Le seul état autorisé à l’ouverture est **`IN_PROGRESS`**.

Raison : ce statut signifie que le paiement est réussi, que la prestation est
en cours et que l’escrow n’est pas encore libéré. Il permet le gel financier
prévu par BR-101.

### États refusés

| État | HTTP | Code | Décision |
|---|---:|---|---|
| `CONFIRMED` | 409 | `booking_dispute_invalid_state` | paiement non abouti dans le contrat FCT-014 |
| `IN_PROGRESS` | — | — | autorisé |
| `COMPLETED` | 409 | `booking_dispute_invalid_state` | escrow déjà finalisé ; voie post-complétion reportée |
| `CANCELLED` | 409 | `booking_dispute_invalid_state` | aucune prestation active à geler |
| `NO_SHOW` | 409 | `booking_dispute_invalid_state` | traité par le flux no-show/remboursement ultérieur |
| `DISPUTED` | 409 | `dispute_already_open` | litige déjà ouvert ou sous revue |
| `REFUNDED` | 409 | `booking_dispute_invalid_state` | paiement déjà remboursé |

### Contradiction documentaire et décision

`BR-100` parle d’une réservation « payée » sans imposer explicitement
`IN_PROGRESS`, tandis que la machine d’état de `06-schema-base.md` ne décrit
que `IN_PROGRESS → DISPUTED`. `SCR-030` est accessible depuis le parcours de
prestation, y compris après l’écran de confirmation, ce qui pourrait suggérer
`COMPLETED`.

**Décision FCT-015 : `IN_PROGRESS` uniquement.** Une contestation après
`COMPLETED` nécessite une politique de compensation et de remboursement non
définie dans le contrat actuel ; elle sera cadrée avec FCT-025. Cette décision
préserve BR-101 (paiement réellement gelable) et la machine d’état publiée.

---

## 3. Contrat API

Préfixe global : `/api/v1`. Authentification :
`Authorization: Bearer <access_token>`.

### 3.1 `POST /api/v1/disputes`

Headers obligatoires :

```text
Authorization: Bearer <jwt>
Idempotency-Key: <UUID>
Content-Type: application/json
```

Body :

```json
{
  "booking_id": "<uuid>",
  "reason": "WORK_INCOMPLETE",
  "description": "Le chantier n’est pas terminé au rendez-vous convenu.",
  "media_ids": ["<uuid>"]
}
```

Réponse `201 Created` :

```json
{
  "id": "<uuid>",
  "booking_id": "<uuid>",
  "opened_by": "<uuid>",
  "reason": "WORK_INCOMPLETE",
  "description": "Le chantier n’est pas terminé au rendez-vous convenu.",
  "media_ids": ["<uuid>"],
  "status": "OPEN",
  "created_at": "<ISO-8601 UTC>",
  "updated_at": "<ISO-8601 UTC>"
}
```

Le header `Location` pointe vers `/api/v1/disputes/:id`.

Idempotence :

- même acteur + même endpoint + même `Idempotency-Key` + même payload
  canonique → même réponse `201`, sans nouvelle ligne ni nouvelle transition ;
- même clé avec un payload différent → `409 idempotency_mismatch` ;
- clé absente ou non UUID → `400 idempotency_key_invalid` ;
- une nouvelle clé alors qu’un litige `OPEN`/`UNDER_REVIEW` existe pour le
  booking → `409 dispute_already_open`.

La portée de la clé est `(route, actor_id, idempotency_key)`. Le hash porte sur
le payload canonique, avec `media_ids` triés et dédoublonnés avant validation.

### 3.2 `GET /api/v1/disputes/:id`

Réponse `200` : le même modèle métier que la création, avec en plus les champs
de résolution lorsqu’ils existent :

```json
{
  "id": "<uuid>",
  "booking_id": "<uuid>",
  "opened_by": "<uuid>",
  "reason": "WORK_INCOMPLETE",
  "description": "…",
  "media_ids": ["<uuid>"],
  "status": "OPEN",
  "resolution": null,
  "resolved_by": null,
  "resolved_at": null,
  "created_at": "<ISO-8601 UTC>",
  "updated_at": "<ISO-8601 UTC>"
}
```

FCT-015 ne permet pas de modifier la ressource. Les champs de résolution sont
lecture seule et restent `null` jusqu’à FCT-025.

---

## 4. Format et validation

### `booking_id`

- UUID v4 valide ;
- obligatoire ;
- booking existant et visible selon les règles d’autorisation ;
- le booking doit être dans l’état `IN_PROGRESS` au moment du verrouillage.

### `reason`

Champ obligatoire, chaîne trimée, valeur exacte parmi :

| Valeur API | Libellé UX |
|---|---|
| `WORK_NOT_CONFORMING` | Travail non conforme |
| `WORK_INCOMPLETE` | Travail non terminé |
| `LATE_OR_NO_SHOW` | Retard ou non-venue |
| `PAYMENT_ISSUE` | Problème de paiement |
| `OTHER` | Autre |

La valeur persistée est le slug stable ; le libellé traduit reste une
préoccupation client.

### `description`

- obligatoire ;
- chaîne UTF-8 trimée ;
- longueur minimale : 1 caractère non blanc ;
- longueur maximale : 1 500 caractères ;
- aucun HTML interprété ; stockage texte brut ;
- la description ne contient ni token, ni donnée de paiement sensible, ni URL
  de fichier fournie par le client.

### `media_ids`

- tableau facultatif ; valeur par défaut `[]` ;
- au maximum 5 éléments ;
- UUID valides et uniques ;
- chaque média doit exister dans `media.files`, appartenir au demandeur ou au
  contexte booking autorisé, et avoir un usage de preuve de litige ;
- les URLs, clés S3 et contenus binaires ne sont jamais acceptés dans ce DTO ;
- un média inexistant ou non autorisé → `404 dispute_media_not_found` ou `403
  dispute_media_forbidden` selon la politique de non-dévoilement retenue.

---

## 5. Autorisation et non-dévoilement

| Action | CLIENT | PROFESSIONAL | ADMIN |
|---|---|---|---|
| Ouvrir sur son booking | oui | oui | non dans FCT-015 |
| Lire son litige | oui | oui | oui |
| Lire un litige tiers | non | non | oui |
| Arbitrer | reporté | reporté | FCT-025 |

Règles :

- `AuthGuard` est obligatoire sur les deux endpoints ;
- le participant est déterminé par `bookings.client_id` ou par le profil pro
  lié à `bookings.professional_id` ;
- un admin peut lire tout litige, mais ne peut pas l’ouvrir via ce POST ;
- booking inconnu ou non visible en lecture → `404 booking_not_found` /
  `404 dispute_not_found` pour éviter l’énumération ;
- participant connu mais rôle non autorisé à l’action → `403 forbidden`.

---

## 6. Transaction, verrous et concurrence

### Ordre global des verrous

Tous les chemins qui touchent une réservation financière verrouillent dans cet
ordre :

1. `market.bookings` par `id` avec `SELECT … FOR UPDATE` ;
2. la transaction `SERVICE_PAYMENT` liée ;
3. `market.disputes` et les opérations financières liées si nécessaire.

Il est interdit de prendre d’abord un verrou `pay.*` puis le verrou booking.
Cet ordre doit être commun à FCT-014 et FCT-015 pour éviter les deadlocks.

### Transaction d’ouverture

Une seule transaction PostgreSQL doit :

1. verrouiller le booking ;
2. vérifier existence, participation, statut `IN_PROGRESS` et absence de
   litige `OPEN`/`UNDER_REVIEW` ;
3. vérifier le paiement `SERVICE_PAYMENT` `SUCCEEDED` et l’absence de payout
   finalisé ;
4. vérifier l’idempotence et le hash de payload ;
5. vérifier les médias autorisés ;
6. insérer `market.disputes` ;
7. passer le booking à `DISPUTED`, en incrémentant `version` et `updated_at` ;
8. écrire l’événement/audit d’ouverture dans la même transaction lorsque le
   port d’audit est disponible ;
9. commit avant toute notification externe.

En cas d’erreur, aucun litige et aucune transition booking ne doivent rester.

### Course avec FCT-014

Le FCT-014 clôturé appelle actuellement `release()` entre sa transaction A et
sa transaction B, sans état persistant de réservation de payout. Un litige
pourrait donc verrouiller `IN_PROGRESS` pendant cette fenêtre, tandis que le
provider aurait déjà libéré les fonds. Le protocole ci-dessous est donc une
condition de compatibilité obligatoire avant l’implémentation.

#### Protocole « premier verrou obtenu, première opération réservée »

FCT-014 et FCT-015 doivent utiliser exactement la même séquence :

1. ouvrir une transaction PostgreSQL ;
2. verrouiller la ligne `market.bookings` ciblée par
   `SELECT ... FOR UPDATE` ;
3. relire l’état booking et la version depuis la ligne verrouillée ;
4. réserver la première opération durable qui décide du gagnant, dans cette
   même transaction ;
5. valider (`COMMIT`) cette décision avant tout appel réseau ;
6. seulement ensuite effectuer ou reprendre l’appel au provider.

Le verrou booking est donc le point de sérialisation unique. Aucun chemin ne
doit verrouiller d’abord `pay.*`, `provider_operations` ou une ligne de
paiement avant le booking.

**Si l’ouverture du litige gagne la course :**

- FCT-015 verrouille le booking et constate `IN_PROGRESS` sans payout réservé ;
- elle insère le litige, passe le booking à `DISPUTED`, puis committe ces deux
  changements atomiquement ;
- aucun `PAYOUT` ne peut ensuite être réservé ou envoyé pour ce booking ;
- `finalize()` doit refuser toute tentative sur un booking `DISPUTED`, avant
  toute réservation ou émission de payout, avec `409 booking_disputed`.

**Si la réservation du payout gagne la course :**

- FCT-014 verrouille le booking et constate `IN_PROGRESS` sans litige ouvert ;
- elle crée d’abord une ligne durable
  `provider_operations(operation_type='PAYOUT', status='PENDING')`, liée au
  booking et au paiement, dans la transaction ;
- elle committe cette réservation avant d’appeler le provider ;
- FCT-015 qui obtient ensuite le verrou relit cette réservation `PENDING` et
  refuse l’ouverture avec `409 completion_in_progress` ;
- aucune seconde réservation de payout ne peut être créée pour le même
  booking/paiement.

La réservation `PENDING` est durable et distincte du résultat du provider :

- `PENDING` signifie que l’opération est réservée localement et que son
  résultat externe est absent ou inconnu ; elle bloque l’ouverture d’un litige
  et interdit une nouvelle émission indépendante ;
- `SUCCEEDED` signifie que le provider a confirmé le transfert ; aucune
  nouvelle émission n’est autorisée ;
- `FAILED` signifie que le provider a explicitement refusé ou échoué le
  transfert. La ligne reste la réservation logique à reprendre, sans créer
  une seconde opération ; elle ne bloque toutefois l’ouverture d’un litige
  que lorsqu’une reprise est effectivement planifiée/en cours et repasse
  l’opération à `PENDING` sous le verrou booking.

Après une erreur provider explicitement connue, un worker ou une reprise
administrative reprend la même opération `PENDING`/`FAILED`, avec bornes,
backoff et journalisation ; il la passe à `SUCCEEDED` ou `FAILED` dans une
transaction dédiée. Un échec ne doit donc jamais laisser un blocage permanent :
le statut, `last_error`, `attempt_count`, `next_attempt_at` et les timestamps
doivent permettre la reprise et l’alerte après épuisement des tentatives.

Une fois l’échec déclaré définitif et aucune reprise réservée, un litige peut
gagner la course sur le même booking. Toute reprise ultérieure doit reprendre
le verrou booking, relire `DISPUTED` et s’arrêter sans appel provider. Si une
reprise est décidée avant cela, elle doit d’abord transformer la réservation
`FAILED` en `PENDING` dans une transaction commitée ; l’ouverture du litige
obtient alors `409 completion_in_progress`.

Après timeout, coupure réseau ou réponse ambiguë, le résultat provider est
**inconnu** : l’opération reste `PENDING` (ou passe dans un état de reprise
équivalent, sans redevenir disponible pour une nouvelle émission). Aucune
seconde tentative de transfert ne peut être faite avec une nouvelle clé. Toute
reprise doit réutiliser la même clé d’idempotence provider et interroger ou
réconcilier la même opération jusqu’à obtenir `SUCCEEDED` ou `FAILED`.

Le chemin de finalisation doit donc vérifier `DISPUTED`, `PENDING`, `SUCCEEDED`
et `FAILED` sous le verrou booking, et ne doit jamais appeler le provider avant
le commit de sa réservation. FCT-015 ne tente jamais de compenser un payout
externe déjà effectué.

Cette réservation est un amendement nécessaire à RF-BK-06/06bis de FCT-014 ;
elle doit être traitée comme une petite correction de compatibilité avant ou
avec FCT-015, pas comme une règle implicite.

---

## 7. Modèle de données et migration

La table `market.disputes` est déjà spécifiée par `06b-tables-mvp-market.md` :

```text
id, booking_id, opened_by, reason, status, resolution,
resolved_by, resolved_at, created_at, updated_at
```

FCT-015 nécessite une migration `013-dispute-opening.ts` :

```text
ALTER TABLE market.disputes
  ADD COLUMN idempotency_key UUID NULL,
  ADD COLUMN request_hash CHAR(64) NULL,
  ADD COLUMN response_snapshot JSONB NULL;

CREATE UNIQUE INDEX uq_disputes_idempotency
  ON market.disputes(opened_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

Le `response_snapshot` contient uniquement la réponse métier de création,
jamais un token, une URL signée ou une donnée provider. Les anciennes lignes
restent compatibles avec des colonnes nullables.

La contrainte existante `uq_disputes_booking` reste la protection finale contre
deux litiges ouverts sur un même booking. La migration doit vérifier l’existence
de la table/contraintes attendues et fournir un `down()` documenté, conformément
aux conventions de `06-schema-base.md` §13.

La réservation `PAYOUT/PENDING` utilise `pay.provider_operations` existant et
ne nécessite pas de nouvelle table. Si la correction FCT-014 choisit un champ
de booking plutôt que cette opération, elle doit être cadrée dans une migration
séparée et ne pas être dissimulée dans la migration FCT-015.

---

## 8. Erreurs HTTP

| Situation | HTTP | Code |
|---|---:|---|
| JWT absent/invalide | 401 | `unauthorized` |
| JSON ou UUID invalide | 400 | `validation_failed` |
| clé absente/invalide | 400 | `idempotency_key_invalid` |
| booking inconnu | 404 | `booking_not_found` |
| litige inconnu/non visible | 404 | `dispute_not_found` |
| participant non autorisé | 403 | `forbidden` |
| média non autorisé | 403/404 | `dispute_media_forbidden` / `dispute_media_not_found` |
| état booking interdit | 409 | `booking_dispute_invalid_state` |
| payout FCT-014 en cours | 409 | `completion_in_progress` |
| litige déjà ouvert avec nouvelle clé | 409 | `dispute_already_open` |
| même clé, payload différent | 409 | `idempotency_mismatch` |
| conflit de version/transition | 409 | `version_conflict` |
| erreur d’écriture interne | 500 | `internal_error` |

Les réponses d’erreur suivent le format JSON existant : message localisable,
code stable et éventuellement `details` de validation, sans SQL ni données
provider.

---

## 9. Matrice de tests

### Unitaires — service/controller

| ID | Scénario | Attendu |
|---|---|---|
| U01 | création client sur `IN_PROGRESS` | `201`, snapshot créé |
| U02 | création pro sur `IN_PROGRESS` | `201` |
| U03 | `CONFIRMED` | `409 booking_dispute_invalid_state` |
| U04 | `COMPLETED` | `409 booking_dispute_invalid_state` |
| U05 | `CANCELLED`, `NO_SHOW`, `REFUNDED` | `409` |
| U06 | booking inconnu | `404` non-dévoilant |
| U07 | non-participant | `403`/`404` selon endpoint |
| U08 | admin tente d’ouvrir | `403` |
| U09 | admin lit un litige | `200` |
| U10 | motif absent/inconnu | `400` |
| U11 | description vide ou > 1500 | `400` |
| U12 | plus de 5 médias, doublon, UUID invalide | `400` |
| U13 | média absent/non autorisé | `404`/`403` |
| U14 | même clé, même payload | même `201` et aucun doublon |
| U15 | même clé, payload différent | `409 idempotency_mismatch` |
| U16 | nouvelle clé avec litige ouvert | `409 dispute_already_open` |
| U17 | payout `PENDING` | `409 completion_in_progress` |
| U18 | erreur transaction | aucun effet partiel |
| U19 | réponse sans PII/provider | vérification du DTO de sortie |

### Repository/intégration

| ID | Scénario | Attendu |
|---|---|---|
| R01 | verrou booking puis paiement | ordre de verrous respecté |
| R02 | insertion + transition | commit atomique |
| R03 | exception après insertion | rollback complet |
| R04 | contrainte `uq_disputes_booking` | un seul litige ouvert |
| R05 | concurrence deux ouvertures | une réussite, un `409` |
| R06 | migration up/show/run | schéma et enregistrement présents |
| R07 | anciennes lignes sans idempotence | lecture compatible |
| R08 | ouverture obtient le verrou avant finalisation | `DISPUTED`, aucune réservation payout |
| R09 | finalisation obtient le verrou avant ouverture | `PENDING` committé, ouverture `409` |
| R10 | échec provider après réservation | statut récupérable, pas de blocage permanent |
| R11 | timeout à résultat provider inconnu | reste `PENDING`, aucune nouvelle clé de transfert |
| R12 | retry après échec/timeout | même opération et même clé provider, transition unique |
| R13 | `finalize()` sur `DISPUTED` | `409 booking_disputed`, aucun appel provider |

### E2E

| ID | Parcours |
|---|---|
| E01 | client ouvre sur booking payé `IN_PROGRESS`, vérifie `DISPUTED` |
| E02 | pro ouvre sur son booking |
| E03 | client/pro lit le détail ; admin lit le détail |
| E04 | inconnu, non-participant et admin POST refusés |
| E05 | états `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `REFUNDED` refusés |
| E06 | motif, description et limites médias |
| E07 | même clé rejouée : même réponse et une seule ligne |
| E08 | même clé avec body différent : `409` |
| E09 | nouvelle clé sur litige ouvert : `409` |
| E10 | deux ouvertures concurrentes : une seule transition `DISPUTED` |
| E11 | ouverture concurrente avec réservation payout `PENDING` : pas de litige, pas de double payout |
| E12 | litige ouvert avant tentative de finalisation : FCT-014 ne libère pas |
| E13 | audit/outbox de l’ouverture si activé |
| E14 | GET ne divulgue pas un litige tiers |
| E15 | litige gagne le verrou : booking `DISPUTED`, aucun `PAYOUT` créé ou envoyé |
| E16 | payout gagne le verrou : `PENDING` committé avant appel provider, litige `409` |
| E17 | provider échoue explicitement : `FAILED`, reprise possible, pas de blocage permanent |
| E18 | provider timeout/résultat inconnu : `PENDING`, aucun second transfert avec une autre clé |
| E19 | retry après timeout : même opération, même clé provider, un seul transfert effectif |
| E20 | `finalize()` concurrent ou ultérieur sur `DISPUTED` : `409`, aucun appel provider |

Les tests E2E utilisent uniquement la base E2E isolée et des fixtures
déterministes ; jamais la base de production. Les règles critiques d’état,
d’idempotence et de concurrence doivent être couvertes à 100 % conformément à
`13-strategie-tests.md`.

---

## 10. Report explicite à FCT-025

Les éléments suivants ne doivent pas être implémentés dans le commit minimal
FCT-015 :

- `GET /admin/disputes` et `PUT /admin/disputes/:id/resolve` ;
- session admin 2FA spécifique à l’arbitrage ;
- décisions client/pro/compromis de BR-102 et BR-104 ;
- appels `REFUND`/`PAYOUT` et annulation de commission ;
- délai d’arbitrage 72 h et escalade ;
- audit métier enrichi de la décision admin ;
- pénalités BR-105, Trust Score et restrictions de retrait ;
- notifications push/SMS à l’ouverture et à la décision ;
- écran SCR-124 et dashboard des litiges.

FCT-015 expose donc l’état `OPEN` et prépare la file d’arbitrage ; FCT-025
assume la résolution financière et administrative.

---

## 11. Livrables attendus

- ce cadrage ;
- migration `013-dispute-opening.ts` ;
- éventuel patch de compatibilité FCT-014 pour `PAYOUT/PENDING` ;
- `DisputeRepositoryPort`, `DisputeService`, DTOs et contrôleur ;
- erreurs stables et contrôle RBAC ;
- tests unitaires, repository et E2E de la matrice ci-dessus ;
- validation `migration:show`/`migration:run` sur la base E2E ;
- build, lint et tests ciblés verts ;
- commit séparé, sans push implicite.
