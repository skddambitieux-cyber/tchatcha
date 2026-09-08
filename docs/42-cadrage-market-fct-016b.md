# Cadrage technique — Market FCT-016B

> Document préparatoire avant implémentation. Ce lot complète FCT-016A sans
> modifier le code applicatif dans cette étape. Il couvre la modification d’un
> avis, la réponse du professionnel, le signalement, la modération et la mise
> à jour de la réputation.

## 1. Sources, état existant et décisions

Sources examinées : `bug.md`, `docs/41-cadrage-market-fct-016.md`,
`docs/12-api-blueprint.md`, `docs/06-schema-base.md`,
`docs/06b-tables-mvp-market.md`, `docs/06d-revue-schema.md`,
`docs/15-securite.md`, `docs/19-business-rules.md`, le module `review`,
le module `admin`, le module `audit`, la migration 014 et le service de
lecture de réputation.

L’état livré par FCT-016A est la référence :

- `review.reviews` est la source de vérité ; l’avis est actuellement créé en
  `APPROVED` et la liste publique ne retourne que `APPROVED` non supprimé ;
- les cinq moyennes sont dans `review.professional_review_stats`, tandis que
  `pros.profiles.rating_avg` et `rating_count` sont synchronisés dans la
  transaction de création ;
- `review.review_flags` existe déjà avec une unicité
  `(review_id, flagged_by)` ;
- `pros.reputation` existe comme cache de réputation, mais aucun service
  d’écriture/recalcul déclenchable par le module review n’est exposé ;
- `audit.logs`, `audit.aggregate_events` et `audit.events` existent en
  base et sont mappés par `AuditModule`, mais le module ne fournit pas encore
  de port applicatif d’écriture transactionnelle ;
- `admin.validation_tasks` est la file générique existante, mais son
  contrôleur actuel ne traite que les vérifications professionnelles.

### Contradictions et arbitrages

| Sujet | Documents ou code | Décision FCT-016B |
|---|---|---|
| Modification | `12-api-blueprint.md` ne liste pas la route, alors que BR-123 l’impose | ajouter `PATCH /api/v1/reviews/:id` ; reporter le contrat dans le blueprint avant implémentation |
| Réponse | le blueprint prévoit `POST /reviews/:id/respond`, BR-124 impose une réponse | conserver cette route et créer une sous-ressource `review.responses` unique |
| Signalement | le blueprint prévoit `POST /reviews/:id/report`, `review_flags` existe déjà | conserver la route et enrichir la table existante |
| Masquage | le schéma ne contient pas `HIDDEN` | conserver `APPROVED` comme visible et utiliser `REJECTED` comme décision de masquage ; `FLAGGED` désigne la file ouverte |
| File admin | `admin.validation_tasks` est générique, sans unicité par avis | l’utiliser pour `entity_type='REVIEW'`, avec une contrainte unique sur une tâche ouverte |
| Audit | les tables existent, le writer métier manque | ajouter un port minimal d’audit/outbox et son adaptateur transactionnel ; aucune écriture depuis un contrôleur |
| Trust Score | formule configurable, pas de formule codée dans BR-130 | réutiliser le service/configuration de réputation ; avis masqué exclu puis score recomputé |
| Suppression | BR-126 interdit la suppression auteur après 24 h | aucune route DELETE ; modification unique sous 48 h |

Les erreurs publiques restent non-divulgantes : ressource absente, ressource
non accessible et ressource inexistante doivent produire le même `404` lorsque
la différence permettrait d’énumérer des avis ou des bookings.

## 2. Périmètre et séquencement recommandé

### FCT-016B1 — écriture auteur/professionnel

- modification unique de l’avis par son auteur sous 48 heures ;
- conservation de l’ancien et du nouveau contenu dans l’audit ;
- réponse unique du professionnel évalué, publique, de 500 caractères maximum ;
- intégration de l’audit/outbox transactionnel commun.

### FCT-016B2 — signalement, modération et réputation

- signalement avec motif obligatoire et protection contre les doublons/abus ;
- file admin, masquage et restauration avec motif obligatoire ;
- exclusion/réinclusion immédiate dans les moyennes, les critères et le Trust Score ;
- concurrence entre édition, réponse, signalement et décision admin.

Le découpage en deux commits sûrs est recommandé. B1 touche deux écritures
isolées et leurs contrats d’audit. B2 modifie la visibilité publique et les
agrégats dénormalisés ; le séparer rend les migrations, les tests de
non-régression et un éventuel rollback plus sûrs.

## 3. Contrats HTTP proposés

Tous les chemins sont préfixés par `/api/v1`. Les réponses suivent l’enveloppe
JSON existante et les erreurs `code/message/details/trace_id/request_id`.

### 3.1 Modifier son avis

`PATCH /reviews/:id`, authentifié, rôle `CLIENT`.

Body :

```json
{
  "rating": 5,
  "punctuality": 4,
  "quality": 5,
  "price_ratio": 4,
  "politeness": 5,
  "comment": "Texte corrigé",
  "media_ids": ["uuid"]
}
```

Le DTO réutilise les limites de FCT-016A : notes 1–5, commentaire ≤ 1 000
caractères, au plus cinq médias valides. Le body est complet pour les champs
éditables ; `booking_id`, les acteurs, le statut et les dates sont interdits.

Réponse `200) : représentation privée de l’avis (`id`, booking, cinq notes,
commentaire, médias, `is_late`, `status`, `created_at`, `updated_at)).

Erreurs : `404 review_not_found`, `403 forbidden`, `409
review_edit_window_closed` après 48 h, `409 review_already_edited`, `409
review_not_editable` si masqué/supprimé, `409 version_conflict`, `422
validation_failed`. La fenêtre est mesurée par `created_at) serveur. Une
édition identique consomme tout de même l’unique édition et est auditée.

### 3.2 Répondre à un avis

`POST /reviews/:id/respond`, authentifié, rôle `PROFESSIONAL`.

Body : `{ "body": "Merci pour votre retour." }`.

`body` est trimé, obligatoire, texte brut, longueur 1–500. L’acteur doit être
le professionnel de `reviewee_id). La réponse n’est autorisée que pour un
avis `APPROVED) visible au moment du verrouillage.

Réponse `201 Created), `Location: /api/v1/reviews/:id/respond` :

```json
{"id":"uuid","review_id":"uuid","professional_id":"uuid",
 "body":"Merci pour votre retour.","created_at":"2026-09-08T12:00:00.000Z"}
```

Un acteur différent reçoit `403 forbidden) ; un avis masqué ou inexistant
retourne `404 review_not_found) ; une réponse existante retourne `409
review_response_exists). `Idempotency-Key` UUID est obligatoire : même clé +
même corps rejoue le même `201), même clé + corps différent retourne `409
idempotency_mismatch`.

### 3.3 Signaler un avis

`POST /reviews/:id/report`, authentifié, rôle `CLIENT) ou
`PROFESSIONAL). Seuls le client auteur du booking et le professionnel évalué
peuvent signaler cet avis.

Body :

```json
{"reason":"HARASSMENT","comment":"Motif détaillé facultatif"}
```

`reason` est obligatoire et limité à `SPAM`, `HARASSMENT`,
`HATE_OR_DISCRIMINATION`, `PERSONAL_DATA`, `FRAUD`, `IRRELEVANT`,
`OTHER`. `comment) est optionnel, ≤ 500 caractères.

Réponse `201) : `{ "id", "review_id", "status": "OPEN", "created_at" }`.
Un second signalement du même acteur retourne `200) avec l’existant, sans
nouvelle tâche ni effet de réputation. Les limites Redis sont appliquées par
acteur, IP et avis ; un signalement n’altère jamais directement les agrégats.

### 3.4 File et décision admin

`GET /admin/reviews?status=OPEN|IN_REVIEW|RESOLVED&limit=50&cursor=...`,
rôle `ADMIN). La réponse contient avis, motifs dédupliqués, compte de
signalements, état de tâche et dates, sans PII inutile.

`POST /admin/reviews/:id/moderate), rôle `ADMIN).

```json
{"decision":"HIDE","reason":"Contenu non conforme"}
```

`decision` vaut `HIDE) ou `RESTORE) et `reason) est obligatoire, trimé,
≤ 1 000 caractères. `HIDE) passe l’avis à `REJECTED), `RESTORE) à
`APPROVED). Réponse `200) avec l’avis modéré et le résumé des agrégats.
Erreurs : `404 review_not_found), `409 moderation_conflict) ou
`invalid_moderation_transition), `422 missing_reason`.

Répéter la même décision et le même motif est idempotent et ne recompute pas.
Une décision opposée est auditée. Un avis masqué est absent de la liste
publique, des moyennes et du Trust Score ; sa restauration recalcule l’ensemble
des avis `APPROVED).

## 4. Modèle de données et migration 015

La prochaine migration est **015-review-interactions**, transactionnelle et
réversible.

### 4.1 Édition et réponse

Ajouter à `review.reviews) :

```text
edit_count smallint NOT NULL DEFAULT 0 CHECK (edit_count BETWEEN 0 AND 1)
edited_at timestamptz NULL
```

Créer `review.review_edits) :

```text
id uuid primary key default gen_random_uuid()
review_id uuid not null references review.reviews(id) on delete cascade
actor_id uuid not null references users.users(id)
before jsonb not null
after jsonb not null
created_at timestamptz not null default now()
unique (review_id)
```

`before` et `after` contiennent seulement les cinq notes, commentaire et
médias ; jamais token ou PII. Le `CHECK) et `UNIQUE(review_id)) imposent
l’unique édition même en concurrence.

Créer `review.responses) :

```text
id uuid primary key default gen_random_uuid()
review_id uuid not null unique references review.reviews(id) on delete cascade
professional_id uuid not null references pros.profiles(id)
body varchar(500) not null check (char_length(body) between 1 and 500)
idempotency_key uuid not null
request_hash char(64) not null
created_at timestamptz not null default now()
```

Ajouter un index `(professional_id, created_at desc)) et une unicité
`(professional_id, idempotency_key)) pour le rejeu contrôlé.

### 4.2 Signalements et file

Enrichir `review.review_flags) :

```text
status varchar(16) NOT NULL DEFAULT 'OPEN'
comment varchar(500)
idempotency_key uuid NULL
request_hash char(64) NULL
resolved_at timestamptz NULL
resolved_by uuid NULL references users.users(id)
```

Conserver `UNIQUE(review_id, flagged_by)), ajouter un `CHECK) sur
`OPEN|IN_REVIEW|RESOLVED|DISMISSED), et l’index `(status, created_at)).
Pour `admin.validation_tasks), ajouter une unicité partielle sur
`(entity_type, entity_id)) pour les états ouverts. Le premier signalement
crée une tâche `REVIEW), les suivants enrichissent cette tâche.

### 4.3 États et contraintes de visibilité

Ajouter des `CHECK) explicites sur `reviews.status) :
`PENDING|APPROVED|REJECTED|FLAGGED).

Transitions :

```text
APPROVED -> FLAGGED   (premier signalement recevable)
FLAGGED  -> REJECTED  (HIDE)
FLAGGED  -> APPROVED  (RESTORE/maintien)
REJECTED -> APPROVED  (RESTORE)
```

Un avis `REJECTED) reste masqué jusqu’à décision admin. Le motif complet est
dans l’audit et la tâche, pas dans un champ tronqué de `reviews).

## 5. Agrégats, Trust Score et audit

La source est toujours `reviewee_id = $1 AND status = 'APPROVED' AND
deleted_at IS NULL`. Après édition, HIDE ou RESTORE, recalculer dans la même
transaction :

1. les cinq `AVG) dans `review.professional_review_stats) ;
2. `pros.profiles.rating_avg) et `rating_count) ;
3. `pros.reputation.punctuality_avg) et les métriques nécessaires ;
4. `pros.reputation.trust_score), `trust_level), `recomputed_at) ;
5. `search.pro_search_docs) directement ou via l’Outbox.

La formule reste celle de BR-020/BR-130 : pondérations en configuration,
arrondi d’affichage à une décimale, plafonds +0,50/−1,00 sur 30 jours. Une
édition remplace les valeurs prises en compte ; elle ne crée pas une seconde
mission. Un avis masqué ne génère aucun bonus qualité et n’est pas compté ; sa
restauration réintègre ses critères et son impact selon les règles existantes.

Le calcul doit être centralisé dans un port/service appelé par la transaction
review. Si le service d’écriture n’existe pas encore, B2 livre cette adaptation
minimale, pas une seconde formule locale dans `ReviewService`.

Chaque mutation écrit dans la même transaction :

- `audit.logs) avec acteur, action, entité, `before), `after), pays et
  contexte disponible ;
- `audit.aggregate_events) pour `review.edited), `review.reported`,
  `review.moderated), `review.response_added), `reputation.recomputed` ;
- `audit.events) pour `review.updated), `review.visibility_changed`,
  `reputation.updated`.

Le writer accepte l’`EntityManager) de la transaction. Aucun appel réseau ne
doit précéder le commit. L’Outbox est consommable après commit et l’historique
reste append-only.

## 6. Transactions, verrous et concurrence

Ordre global obligatoire :

1. `pros.profiles) du professionnel, `FOR UPDATE) ;
2. `review.reviews), `FOR UPDATE) ;
3. enfant concerné (`review_edits), `responses), `review_flags)) ;
4. stats, réputation et tâche admin ;
5. audit/outbox ; commit.

FCT-016A verrouille actuellement `booking) puis met à jour les agrégats.
Avant B, appliquer l’ordre compatible `booking → profile → review) pour la
création et `profile → review → enfants) pour les interactions, ou un
advisory lock commun sur `reviewee_id). Aucun chemin ne doit prendre
`review) puis `profile) dans l’ordre inverse.

| Course | Résultat attendu |
|---|---|
| Deux PATCH simultanés | une seule ligne `review_edits), l’autre `409` |
| PATCH et HIDE | sérialisation ; si HIDE gagne, PATCH refusé |
| Deux réponses | une seule réponse, l’autre replay ou `409` |
| Réponse et HIDE | HIDE bloque une nouvelle réponse ; réponse existante non publique avec l’avis |
| Deux signalements du même acteur | un seul flag et une seule tâche |
| Signalements de plusieurs acteurs | plusieurs flags, une seule tâche ouverte |
| HIDE/RESTORE simultanés | dernier état validé et agrégats cohérents |
| Recalcul concurrent | verrou de profil, aucun agrégat partiel au commit |

Les lectures publiques restent sans verrou et filtrent strictement `APPROVED)
et `deleted_at IS NULL). Les écritures retournent `409) sur conflit
récupérable.

## 7. Autorisations et erreurs

- édition : auteur client, jamais pro/admin, fenêtre serveur 48 h ;
- réponse : professionnel évalué uniquement, avis public ;
- signalement : client du booking ou professionnel évalué ;
- modération/file : `ADMIN) via `AdminGuard) et RBAC ;
- liste publique : aucun avis `FLAGGED), `REJECTED) ou supprimé ;
- aucun endpoint ne modifie ou supprime un audit.

Codes minimums : `review_not_found) (404), `forbidden) (403),
`validation_failed) (422), `missing_reason) (422),
`review_edit_window_closed) (409), `review_already_edited) (409),
`review_response_exists) (409), `idempotency_mismatch) (409),
`moderation_conflict) (409), `rate_limited) (429). Le 404 est utilisé
lorsque la distinction créerait une énumération.

## 8. Matrice de tests exigée

### Unitaires

- DTO : UUID, notes, commentaire 1 000, réponse 1–500, motif obligatoire ;
- édition : auteur, fenêtre, unicité, normalisation et diff ;
- réponse : pro évalué, unicité, longueur, rôles négatifs ;
- signalement : motifs, doublon, acteur hors relation, rate limit ;
- modération : HIDE/RESTORE, motif, transitions ;
- recomputation : cinq moyennes, exclusion/réinclusion, Trust Score et
  visibilité `completed_jobs >= 5) ;
- audit/outbox : payloads, acteur, ordre, transaction.

### Repository/intégration

- migration 015 sur base propre après 001–014 et rollback ;
- contraintes `CHECK), uniques, FK et index ;
- PATCH concurrent ; réponse unique et replay idempotent ;
- premier/deuxième signalement et tâche unique ;
- HIDE puis absence de la liste et des agrégats ;
- RESTORE puis égalité avec le recalcul complet SQL ;
- rollback sans review/tâche/audit/outbox partiel ;
- absence de deadlock avec `POST /reviews) FCT-016A.

### E2E

- client auteur édite dans la fenêtre (`200)), hors fenêtre (`409)) ;
- autre client, pro et admin ne peuvent pas éditer ;
- pro évalué répond, second POST rejoue ou retourne `409) ;
- pro non évalué et client ne répondent pas ;
- client/pro autorisés signalent, doublon idempotent, tiers refusé ;
- admin liste, passe `IN_REVIEW), HIDE avec motif, RESTORE avec motif ;
- admin sans motif (`422)), non-admin (`403)), avis inconnu (`404)) ;
- avis masqué absent de la liste et des moyennes ;
- restauration visible avec moyennes et Trust Score restaurés ;
- concurrence édition/réponse/signalement/modération ;
- non-régression des tests review FCT-016A, admin, professionnels et search.

## 9. Conditions d’acceptation avant code

1. Valider `REJECTED = masqué), `FLAGGED = en file), sans état public ambigu.
2. Ajouter le contrat PATCH au blueprint et confirmer le body complet.
3. Exposer le writer audit/outbox et le port de recalcul avant les contrôleurs.
4. Livrer B1 puis ses migrations/tests ; ensuite B2 et son recalcul.
5. Exécuter migration propre, unitaires, repository, E2E, build, lint et
   `git diff --check) avant chaque commit.

## 10. État Git de référence au cadrage

Le cadrage a été préparé sur `develop), HEAD
`15539f66cdeb4ffddf4b9bbd3b5314b0edbd2429`, arbre propre et synchronisé avec
`origin/develop` avant l’ajout de ce document. Cette étape ne produit aucun
changement de code, commit ou push.
