# Cadrage contractuel — Lot FCT-014 : double confirmation + libération escrow (`POST /bookings/:id/confirm`)

> Livrable de cadrage (méthode bug.md) avant implémentation.
> Périmètre : fin de prestation — double confirmation client/pro (US-034, US-060,
> SCR-083/084/029), transition automatique `CONFIRMED → IN_PROGRESS` au succès du
> paiement, calcul de commission (BR-094), libération simulée de l'escrow au passage
> `COMPLETED` (BR-087/BR-091), uniquement via l'architecture `PaymentGatewayPort` de
> FCT-013. Rétrocompatibilité : paiements déjà `SUCCEEDED` rattrapés par la migration.
> Sources : `12-api-blueprint.md` L202 (FCT-014 = `POST /bookings/:id/confirm`
> (client/pro)) ; `06-schema-base.md` L210-234 (machine d'états bookings) ;
> `06b-tables-mvp-market.md` L70-95 (`market.bookings` `client_confirmed_at`/
> `pro_confirmed_at`), L121-213 (`pay.transactions`/`provider_operations`/
> `pay.commissions`) ; `19-business-rules.md` BR-070..094 ; `07k` SCR-029/084 ·
> `07j` SCR-083 ; `06a` L265 (`pros.categories`) ; `10-blueprint-backend.md` MOD-07
> (`ConfirmCompletion`, double confirmation) ; `15-securite.md` T07 ;
> `02-adr.md` ADR-015 (isolateur fournisseurs, `provider_operations`) ;
> `12` L12 (`/bookings/:id/confirm` = action non-CRUD).

---

## 1. Objectif et périmètre

- US-034/060 (07g) : la prestation payée se termine par la **double confirmation**
  (client **et** pro, sans ordre imposé par le backend — l'UX peut pousser le pro à
  confirmer en premier, ce n'est **pas** une règle métier). Première confirmation =
  horodatage du rôle concerné ; deuxième = transition atomique vers `COMPLETED`.
- Le succès `SUCCEEDED` du flux FCT-013 **entraîne automatiquement** le booking
  `CONFIRMED → IN_PROGRESS` (06-schema-base L212 « PAID --> IN_PROGRESS :
  réservation confirmée ») **dans la même transaction SQL** que `SELECTED → PAID`
  (bug.md point 4 — pas de transition « artificielle » à la première confirmation).
- La libération de l'escrow est **matérialisée séparément** du statut `COMPLETED` :
  opération `PAYOUT` dans `pay.provider_operations` via `PaymentGatewayPort`
  (bug.md point 1 — modèle le plus petit compatible : l'enum documenté de
  `operation_type` (06b L152) contient déjà `CHARGE, REFUND, PAYOUT, VERIFY` ;
  aucun statut de transaction nouveau, aucune table nouvelle).
- **Architecture retenue (amendement bug.md FCT-014)** : **aucun appel réseau dans
  une transaction PostgreSQL**. La double confirmation s'exécute en **3 phases** :
  transaction A (verrou + horodatage + décision, commit avant tout appel externe)
  → `release()` hors transaction avec **clé d'idempotence stable** → transaction B
  (payout/commission/COMPLETED). L'idempotence fournisseur est la **protection
  primaire** contre la double libération (même clé sur tous les retries), l'index
  unique base n'étant que le backstop (détail RF-BK-06..09/11, §4).
- La commission TCHATCHA (BR-094) est **incluse** : calcul brut/commission/net au
  passage `COMPLETED`, snapshot dans `pay.commissions` (bug.md point 2).
- **Hors périmètre** (verrous bug.md) : BR-092 auto-libération 72 h (sous-lot
  séparé, scheduler) · NT-010 rappel push (lot notifications) · FCT-015 litiges
  (aucune vérification de litige dans ce lot — `DISPUTED` existe déjà en base,
  aucun endpoint) · webhooks de release asynchrones de vrais providers · écran
  admin commission SCR-129 (FCT-025) · espèces CASH (BR-093, aucun provider CASH
  implémenté en FCT-013) · GET /bookings (hors contrat 12 L202).

## 2. Règles fonctionnelles (verrouillées)

| ID | Règle |
|---|---|
| RF-BK-01 | **Transition automatique `CONFIRMED → IN_PROGRESS`** : ajoutée dans `TypeOrmPayRepository.confirm()`, **dans la même transaction SQL** que le SUCCEEDED et le passage requête `SELECTED → PAID`. `UPDATE market.bookings b SET status='IN_PROGRESS', version=b.version+1, updated_at=now() FROM pay.transactions t WHERE t.id=$1 AND b.id=t.booking_id AND b.status='CONFIRMED'` — rowcount **1 obligatoire**, sinon rollback (`RollbackSignal('BOOKING_ILLEGAL_TRANSITION')`, même pattern que la requête PAID, qui reste le cœur atomique). Couvert par le chemin webhook existant : `pay.service` **inchangé**. |
| RF-BK-02 | **Rétrocompatibilité** : migration 012 — backfill `UPDATE market.bookings b SET status='IN_PROGRESS', version=b.version+1, updated_at=now() FROM pay.transactions t WHERE t.booking_id=b.id AND t.status='SUCCEEDED' AND b.status='CONFIRMED'` (paiements de pré-FCT-014 jamais entrés en prestation). Nouveaux paiements : transition en ligne (RF-BK-01). Aucun booking `COMPLETED` préexistant possible (aucune transition n'existait). |
| RF-BK-03 | **`POST /api/v1/bookings/:id/confirm`** (module market, action non-CRUD 12 L12) : authentifié (AuthGuard) ; requérant = `client_id` (client) ou `professional_id` (pro) du booking. Booking inconnu → **404 non-dévoilant** ; non-participant → **403**. |
| RF-BK-04 | **État accepté : `IN_PROGRESS` uniquement.** `CONFIRMED` (paiement non abouti), `COMPLETED` (déjà fait), `CANCELLED`/`NO_SHOW`/`DISPUTED`/`REFUNDED` → **409 `booking_confirmed_invalid_state`**. |
| RF-BK-05 | **Première confirmation** : `UPDATE market.bookings SET <role>_confirmed_at=now(), updated_at=now() WHERE id=$1 AND <role>_confirmed_at IS NULL` (rowcount 1 = ce rôle confirmait en premier). Réponse 200, statut reste `IN_PROGRESS`. Rejeu par le même rôle (timestamp déjà posé) → **200 état courant** (idempotent, pas d'erreur). |
| RF-BK-06 | **Deuxième confirmation — transaction A (repository, DataSource, courte)** : (1) `SELECT … FROM market.bookings WHERE id=$1 AND (client_id=$2 OR professional_id=$2) FOR UPDATE` (verrou ligne → sérialise les confirmations simultanées) ; (2) contrôles §RF-BK-03/04 + timestamp du rôle + existence d'une transaction `SERVICE_PAYMENT` `SUCCEEDED` ; (3) UPDATE timestamp du rôle (rowcount 1) ; (4) si les **deux** timestamps posés : **construction déterministe de l'intention de release** (`ReleaseIntent`, RF-BK-11) — jamais persistée, recomputée à l'identique depuis la ligne booking (montant net, clé d'idempotence, téléphone bénéficiaire) ; **COMMIT AVANT tout appel réseau** (aucun appel fournisseur dans une transaction PostgreSQL — décision architecture bug.md). |
| RF-BK-06bis | **Release externe (couche application, hors transaction)** : `PaymentGatewayPort.release()` est appelé **entre transaction A et transaction B**, avec la clé d'idempotence stable de l'intention. Aucun état DB n'est « réservé » : l'intention étant déterministe, un rejeu la recompute à l'identique (RESUME_RELEASE, RF-BK-06ter). |
| RF-BK-06ter | **Transaction B (repository, courte)** : (1) `SELECT … FOR UPDATE` de la ligne booking ; (2) si statut `COMPLETED` → `ALREADY_COMPLETED` (rejeu strictement idempotent, aucune écriture) ; (3) si l'issue de release est `FAILED` (échec **explicite** du fournisseur) → **`INSERT pay.provider_operations(…, operation_type='PAYOUT', status='FAILED', …)`** (traçabilité, une ligne par tentative explicitement rejetée), booking **reste `IN_PROGRESS`**, timestamps des deux confirmants **conservés** → état retryable, réponse **502 `release_failed`** ; (4) si `SUCCEEDED` → `INSERT pay.provider_operations(…, 'PAYOUT', 'SUCCEEDED', amount=net, external_ref)` ; `INSERT pay.commissions(transaction_id, rule_code='CATEGORY_RATE', rate, amount)` ; `UPDATE market.bookings SET status='COMPLETED', version=version+1 WHERE id=$1 AND status='IN_PROGRESS'` (rowcount 1) ; COMMIT. |
| RF-BK-07 | **Échec de release → jamais COMPLETED** : échec **explicite** (`FAILED` ou exception → assimilée à un échec non fiable) → la transaction B n'écrit **aucun payout SUCCEEDED ni commission** et répond **502 `release_failed`** retryable. **Différence contractuelle échec explicite / résultat ambigu** : l'échec explicite est retenté par un nouvel appel release (rejet fournisseur) ; le **résultat ambigu** (timeout, crash entre release réussie et finalize) est repris avec **la même clé d'idempotence** — le fournisseur ne libère **jamais deux fois** (RF-BK-08), le rejeu se contente de « découvrir » la libération déjà faite. Aucune compensation nécessaire (release synchrone simulée). |
| RF-BK-08 | **Jamais deux libérations** : (a) **primaire — idempotence fournisseur** : `GatewayRelease.idempotencyKey` = identité métier stable de la release (`payout:<transaction_id>`, dérivée du paiement, unique pour le booking, **identique sur tous les retries**) ; le simulateur (et tout vrai provider, ADR-015) **doit** répondre à une clé déjà libérée avec la **même** `external_ref` sans nouvelle libération (contrat port RF-BK-11). (b) **backstop base** : verrou `FOR UPDATE` + rowcounts + **index unique partiel `uq_provider_ops_release_once`** sur `pay.provider_operations(transaction_id) WHERE operation_type='PAYOUT' AND status='SUCCEEDED'` (une seule ligne réussie, fenêtre de crash couverte par la résolution en reprise RF-BK-09). Le backstop n'est **jamais** la seule protection. |
| RF-BK-09 | **Rejeu après `COMPLETED`** (même rôle ou autre rôle) → **200** état courant, **aucun** nouvel appel release ni écriture (guard statut + transactions B RF-BK-06ter(2)). **Reprise après crash** (release réussie, finalize jamais exécutée) : rejeu → transaction A voit les deux timestamps → **RESUME_RELEASE** (l'intention est recomputée, la même clé est transmise) → release idempotente (même `external_ref`) → transaction B termine payout/commission/COMPLETED. |
| RF-BK-10 | **Commission (BR-094)** : configuration = colonne **`pros.categories.commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00`** + CHECK 0..100 (migration 012) — seule entité « par catégorie » du schéma (06a L265), la donnée seed 10 % (SCR-129) n'est pas du code en dur ; l'édition admin arrive avec FCT-025. Catégorie du booking : `market.service_requests.category_id` (la requête porte la catégorie ; pas de `service_id` sur `market.quotes` — audité). Calcul en SQL, jamais en float : `commission = ROUND(b.price * c.commission_rate / 100, 2)` ; `net = price − commission`. Snapshot : `pay.commissions(transaction_id, rule_code='CATEGORY_RATE', rate, amount)` (06b L200). Le **net** est le `amount` de l'opération PAYOUT. |
| RF-BK-11 | **Release simulée — modèle le plus petit compatible** (bug.md point 1) : extension du port `PaymentGatewayPort` (FCT-013) — `release(req: GatewayRelease): Promise<GatewayReleaseResult>` (simulateur : SUCCEEDED synchrone, `external_ref` distinct généré `rel-<uuid>`, jamais d'échec sauf si simulé pour test). **Contrat d'idempotence du port** : `req.idempotencyKey` (stable, RF-BK-08a) doit être honoré — pour une clé déjà libérée, retourner la même `external_ref`, **sans nouvelle libération**. Aucun statut de transaction nouveau (`TransactionStatus` intact), aucune table nouvelle : la release vit dans `provider_operations` (`operation_type='PAYOUT'`, enum documenté 06b L152) sur la transaction d'origine. Un vrai provider pourra remplacer le simulateur sans changer le lot (ADR-015). |
| RF-BK-12 | **Ownership/réponse** : la réponse n'expose jamais un booking non possédé (404/403) ; montant brut = prix du devis accepté (déjà connu des deux parties) ; **commission et net non exposés** dans la réponse confirm (vue Revenus FCT-023 plus tard). |
| RF-BK-13 | **Comportements contractuels explicites** (bug.md FCT-014 — partie intégrante du contrat, non masqués) : (1) après échec de release, le **timestamp du second confirmant est conservé** (le rejeu du même rôle déclenche directement RESUME_RELEASE — pas de re-confirmation nécessaire) ; (2) une opération **`PAYOUT FAILED`** est tracée pour chaque échec explicite (historique exploitable) ; (3) **RESUME_RELEASE** est un chemin de reprise à part entière (intention recomputée, release idempotente, transaction B) ; (4) **`ReleaseIntent`** = valeur déterministe recomputée à chaque rejeu (jamais persistée) ; (5) la distinction **échec explicite vs résultat ambigu** suit RF-BK-07. |

## 3. Contrat API

Préfixe global `/api/v1` ; `Authorization: Bearer <access_token>`.

### 3.1 `POST /api/v1/bookings/:id/confirm`

**Body** : aucun (le rôle est dérivé du token ; le sens « client »/« pro » est dérivé de la ligne booking).

**200** → `BookingView` étendue (statut courant) :
```json
{
  "id": "<uuid>", "request_id": "<uuid>", "quote_id": "<uuid>", "slot_id": "<uuid>",
  "professional": { "id": "<uuid>", "business_name": "Kossi A." },
  "scheduled_start": "…", "scheduled_end": "…",
  "status": "COMPLETED",
  "client_confirmed_at": "…", "pro_confirmed_at": "…",
  "price": 200000, "currency": "XOF", "version": 3
}
```
(rejeu trimestriel : même corps, état figé).

**Erreurs** : `401 unauthorized` · `404 booking_not_found` (inconnu — non-dévoilant) · `403 forbidden` (non-participant) · `409 booking_confirmed_invalid_state` (statut ≠ `IN_PROGRESS`) · `502 release_failed` (échec libération, retryable).

## 4. Architecture (verrouillée)

- **`TypeOrmPayRepository.confirm()` modifié (FCT-013)** : + RF-BK-01 (UPDATE `IN_PROGRESS`, rowcount requis, rollback sinon). C'est le **seul** changement du module pay côté paiement : `pay.service` et le webhook restent identiques.
- **Module market — confirm = 3 phases, aucune release dans une transaction** (décision bug.md FCT-014) :
  - **Phase A (transaction courte)** : `BookingRepositoryPort.confirm(bookingId, userId)` → verrou `FOR UPDATE`, contrôles (404/403/409/RF-BK-04), horodatage du rôle, décision `FIRST_CONFIRMED` (commit, aucune release) | `SECOND_CONFIRMED` / `RESUME_RELEASE` (commit puis release) | `ALREADY_CONFIRMED` / `ALREADY_COMPLETED` (rejeu, aucune release). La vue et l'`ReleaseIntent` déterministe (RF-BK-11) sont rendues.
  - **Phase B (hors transaction)** : `BookingService` appelle `PaymentGatewayPort.release()` avec `ReleaseIntent` (clé d'idempotence stable). Toute exception réseau est assimilée à un échec → issue `FAILED`.
  - **Phase C (transaction courte)** : `BookingRepositoryPort.finalize(bookingId, intent, outcome)` → re-verrou, écrit l'issue (PAYOUT SUCCEEDED/FAILED + commission + COMPLETED, RF-BK-06ter), résout le crash-window via l'index unique (RF-BK-08/09).
  - `BookingService.confirm(userId, bookingId)` : décision (404/403/409/rejeu 200), orchestre A → B → C, mappe `ConfirmResult` (`FIRST_CONFIRMED` | `COMPLETED` | `ALREADY_COMPLETED` | erreurs).
  - `bookings.controller.ts` : `POST :id/confirm` (pas de body, `@HttpCode(200)`).
  - Erreurs nouvelles dans `request-errors.ts` : `BookingConfirmIllegalStateError` (409), `BookingReleaseFailedError` (502).
- **Module pay** : `pay.module.ts` **exporte désormais `PaymentGatewayPortToken`** ; `market.module` importe `PayModule`. Port étendu + simulateur : `release()` (RF-BK-11), idempotent par clé (RF-BK-08a).
- **Migrations (1 seule, `012-booking-confirmation.ts`)** :
  1. `ALTER TABLE pros.categories ADD COLUMN commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00` + `CHECK 0..100` ;
  2. `CREATE UNIQUE INDEX uq_provider_ops_release_once ON pay.provider_operations(transaction_id) WHERE operation_type='PAYOUT' AND status='SUCCEEDED'` ;
  3. backfill RF-BK-02.
  Rien d'autre : `client_confirmed_at`/`pro_confirmed_at` (001 L387-388) et
  `provider_operations` a déjà `operation_type` (varchar libre, pas de CHECK) — **aucun
  nouveau statut**. ⚠️ Audit d'implémentation : `pay.commissions` (06b §2) n'avait
  **jamais été créée en base** malgré le doc → la migration 012 la crée (avec
  `uq_commissions_transaction` et `ck_commissions_rate`).
- **Aucune variable d'environnement nouvelle.**

## 5. Sécurité

- Les deux timestamps de confirmation sont écrits **uniquement** par le rôle concerné (colonne par rôle, rowcount conditionnel sur `IS NULL`) ; `FOR UPDATE` empêche toute course.
- Non-dévoilement : 404 pour booking inconnu ou d'autrui (même code que le Pattern RF-PW05) ; la réponse n'expose pas commission/net.
- La libération est un acte **financier idempotent** : verrou + rowcount + index unique partiel → au plus un PAYOUT SUCCEEDED par transaction (T07, gel jusqu'à double confirmation).
- Aucune donnée du provider exposée ; `provider_code='SIMULATOR'` n'apparaît pas dans les réponses API.

## 6. Tests (cibles)

**Unitaires** (`booking.service.spec.ts`, pattern existant) : rejets 404 (inconnu), 403 (non-participant ; client sur le booking d'autrui, pro non lié) ; 409 sur `CONFIRMED`/`CANCELLED`/`NO_SHOW`/`DISPUTED`/`REFUNDED`/`COMPLETED` ; rejeu rôle déjà confirmé → 200 ; rejeu booking COMPLETED → 200 sans appel de `release` ; `release` FAILED → `BookingReleaseFailedError` + état laissé `IN_PROGRESS` ; le callback `release` **n'est jamais appelé** si la transaction a échoué avant ; montant transmis à `release` = net (le calcul SQL est vérifié en e2e).

**E2E** (`bookings-confirm.e2e-spec.ts`, pattern `payments.e2e-spec.ts`) : P1 happy path client→pro (initiate → verify → webhook SUCCEEDED → booking **IN_PROGRESS** vérifié en base → confirm client 200 `IN_PROGRESS` + `client_confirmed_at` → confirm pro 200 `COMPLETED` + les deux timestamps) → en base : booking COMPLETED, **exactement une** `provider_operations` de type PAYOUT status SUCCEEDED (amount = net), ligne `pay.commissions` (rate/amount conformes à la catégorie seedée) ; P2 ordre inversé pro→client → identique ; P3 rejeu après COMPLETED → 200, toujours une seule opération PAYOUT ; P4 second confirm même rôle → 200 sans transition ; P5 confirm avant paiement (booking CONFIRMED) → 409 ; P6 cancel/no-show → 409 ; P7 client sur booking d'autrui → 403 ; P8 booking inconnu → 404 ; P9 **concurrence** : confirm client + pro simultanés (`Promise.all`) → une seule 200 `COMPLETED` + une seule release (index unique) + l'autre appel 200 (rejeu) — aucune exception 500 ; P10 `release_failed` (panne simulée via config test) → 502 + booking toujours `IN_PROGRESS` + **timestamps des deux confirmants conservés (RF-BK-13)** + **une** opération PAYOUT **FAILED** tracée (RF-BK-06ter/13) + **zéro** PAYOUT SUCCEEDED + rejeu du 2e confirmant → RESUME_RELEASE → 200 COMPLETED, un seul payout, une seule commission ; P11 taux de commission seed 0 % / 25 % → net = brut / net = 0,75 × brut (2 catégories seedées en e2e) ; P12 **mise à jour** de `payments.e2e-spec.ts` L241/272 : après SUCCEEDED, booking désormais **IN_PROGRESS** (rétrocompat) ; P13 **résultat réseau ambigu** (release lève une fois) → 502 puis rejeu avec **la même clé d'idempotence** (espionnage des 2 appels) → 200 COMPLETED, un seul payout, une seule commission — jamais de deuxième libération logique ; P14 **crash simulé entre release réussie et finalize()** (finalize lève → 500) → booking `IN_PROGRESS` (timestamps posés, aucun payout) → rejeu → même clé, `RESUME_RELEASE`, 200 COMPLETED, un seul payout, une seule commission, même `external_ref` côté simulateur (idempotence RF-BK-08a).

**Migration** : `migration:run`/`revert` vérifiés manuellement (pattern FCT-013) sur une base contenant un paiement SUCCEEDED → backfill → booking IN_PROGRESS.

## 7. Livrables

- Cadrage (ce fichier) · migration `012-booking-confirmation.ts` · changement `confirm()` FCT-013 (RF-BK-01) · port + simulateur `release()` (FCT-013 architecture) · `payment-gateway.port.ts` étendu · commande market `confirm` + DTO + erreurs · `pay.module` export token · ajustement `payments.e2e-spec.ts` · tests unitaires + e2e · lint/build verts (`nx`) · commit + push develop.