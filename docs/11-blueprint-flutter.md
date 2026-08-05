# 4.2 — Flutter Blueprint

Version : 1.0 — Étape 4. **Aucun code.** Contrats par couche et par flux d'écran.
Complète `07l-flutter-documentation.md` (contrats par SCR) et `04-arborescence-projet.md`
(monorepo : `core` + `app_client` + `app_pro` + `app_deliverer` P2).

---

## 1. Principes

| Principe | Application |
|---|---|
| State management | Riverpod (StateNotifier/AsyncNotifier) — jamais de setState métier hors widget local |
| Offline-first | lectures = cache d'abord (skeleton pendant refetch) ; écritures = file d'attente |
| Une source de vérité | les modèles `core/models` reflètent les contrats API (12) |
| Testabilité | chaque screen = widget stateless + Controller pur testable |
| Localisation | ARB + gen-l10n ; pays courant en tête d'app (SCR-002) |
| Thème | tokens `07d` → `core/theme` (couleurs, radius, typo, motion) |
| Design system | widgets `core/widgets` = composants `07c` 1:1 |
| Traçabilité | `US-XXX ↔ SCR-XXX ↔ widget` (07g/07k) — commentaire en tête de fichier |

---

## 2. Package `core` (partagé)

### 2.1 api/
| Composant | Rôle |
|---|---|
| `ApiClient` | HTTP (dio), base URL par environnement, interceptors |
| `AuthInterceptor` | injecte access token ; refresh automatique (401 → refresh rotatif → retry 1×) ; queue des requêtes concurrentes pendant refresh |
| `IdempotencyInterceptor` | header `Idempotency-Key` (UUID v4) sur POST critiques |
| `ErrorInterceptor` | normalise `ApiError{code, message, details}` (contrat 12 §7) → `Failure` |
| `ApiEndpoints` | constantes de routes, versionnées `/api/v1/…` |
| `WebSocketClient` | chat temps réel, reconnect avec backoff, heartbeat |

### 2.2 models/
Modèles `freezed` immuables (entités `07l` §3), `fromJson` miroir des DTO :
`User, Session, OtpChallenge, Country, Division, Category, Professional,
ProfessionalSummary, Service, PortfolioItem, Availability, Slot,
ServiceRequest, Quote, Booking, Transaction, Wallet, Review, Conversation,
Message, Notification, Dispute, SearchFilters, PageInfo…`

Règle : **un modèle = un objet JSON de l'API** ; pas de modèle « hybride ».

### 2.3 providers/ (state management)
- `AppConfigProvider` (env, feature flags)
- `SessionProvider` (session, user courant, refresh)
- `LocaleProvider` (langue + pays actifs)
- `ConnectivityProvider` (état réseau, bandeau)
- `LocationProvider` (GPS : position, permissions, dégradé manuel)
- `SyncQueueProvider` (file hors-ligne : envois différés + statut)

### 2.4 theme/ — 1:1 avec tokens `07d`
`colors.dart, typography.dart, spacing.dart, radius.dart, shadows.dart,
motion.dart, breakpoints.dart` + `AppTheme` (light ; dark = Phase 3).

### 2.5 widgets/ — 1:1 avec `07c`
`AppButton (3 variantes + loading), AppTextField, AppChip, AppCard, AppSheet,
AppDialog, AppSkeleton, AppEmptyState, AppErrorState, AppBanner (hors-ligne),
AppBottomNav, AppStepper, RatingStars, MoneyText, VerifiedBadge, ProCard,
QuoteCard, RequestCard, SlotChips, TimelineView, ImageGrid, ImagePickerField,
MediaViewer, LocationPicker, OTPField, CountdownButton, PullToRefresh…`

### 2.6 utils/
`format (FCFA, dates, durées), validators (téléphone E.164, budget, titre…),
geo (distance, rayon), storage (Hive : cache, préférences), deeplinks
(notification → écran cible SCR), analytics logger`.

---

## 3. Pattern par écran (référence obligatoire)

```
features/<flux>/
├── <ecran>_screen.dart        # Widget pur (build only) — reçoit state + callbacks
├── <ecran>_controller.dart    # Riverpod : état + actions (events)
├── <ecran>_viewmodel.dart     # projection de l'état pour l'UI (si complexe)
├── <ecran>_models.dart        # modèles locaux au flux (brouillons, drafts)
└── test/
    ├── <ecran>_screen_test.dart      # widget tests (états, événements)
    └── <ecran>_controller_test.dart  # tests controller (mocks repos)
```

| Champ (bug.md) | Règle |
|---|---|
| **Widget** | stateless ; lit le state via provider ; zéro logique ; nom = `SCR_XXX` en commentaire |
| **State management** | `AsyncNotifier` par écran ; `AsyncValue` (loading/data/error) + sous-états métier |
| **ViewModel** | pure, testée ; jamais de calcul dans le build |
| **Repository** | interface + implémentation (http/cache) ; 1 repo par ressource API |
| **UseCases** | méthodes du repo appelées par le controller (1 API = 1 use case) |
| **Navigation** | `go_router` : routes déclarées (SCR en commentaire), guards (auth, rôle), deeplinks |
| **Validation** | `formz`/`FormFieldValidator` côté client ; le serveur reste la source finale |
| **Gestion offline** | lecture : Hive cache + refetch ; écriture : `SyncQueueProvider` (voir §6) |

---

## 4. Flux d'écrans (tous les SCR — référence `07k` §couverture)

| Flux | Écrans | Contrats détaillés |
|---|---|---|
| Auth | SCR-001..004 | `07l` FLOW A |
| Accueil & recherche | SCR-005..010 | `07l` FLOW B |
| Fiche pro | SCR-011..014 | `07l` FLOW E |
| Favoris / Notifs / Messagerie | SCR-015..018 | `07l` FLOW E bis (07k) |
| Besoin (wizard) | SCR-019..021 | `07l` FLOW C |
| Devis / négociation | SCR-022..025 | `07l` FLOW D |
| Créneau / paiement / prestation / avis / litige | SCR-026..031 | `07l` FLOW D + 07k |
| Profil / paramètres / RGPD / aide | SCR-032..035 | 07k |
| Pro — dashboard & demandes | SCR-077..081 | `07l` FLOW F/G |
| Pro — planning / prestation / revenus / stats / avis | SCR-082..090 | `07l` + 07k |
| Admin (web Flutter) | SCR-120..129 | `07l` FLOW H + 07k |

Chaque écran respecte les 8 états transverses (`07b` §12) : chargement (skeleton),
vide, erreur (+Réessayer), hors-ligne (bandeau), succès, pull-to-refresh,
expiration session (refresh silencieux → sinon DLG-008), permission refusée (DLG-013/014).

---

## 5. Règles de validation client

| Champ | Règle | Message type (07f) |
|---|---|---|
| Téléphone | E.164, +229…, 8-12 chiffres | « Vérifiez le numéro (ex. +229 61 23 45 67) » |
| OTP | 6 chiffres, auto-advance | « Code invalide, il vous reste N essais » |
| Titre besoin | requis, ≤ 160 car. | « Donnez un titre clair » |
| Budget | min ≤ max, même devise | « Le montant maximum doit être ≥ au minimum » |
| Avis | 5 notes 1-5, commentaire ≤ 1000 | « Notez chaque critère » |
| Devis (pro) | prix > 0, délai ≥ 0 | « Prix obligatoire » |

Le serveur re-valide toujours (source de vérité) ; l'erreur API s'affiche dans le
composant concerné (contrat erreurs 12 §7).

---

## 6. Gestion offline (stratégie)

| Situation | Comportement |
|---|---|
| Lecture sans réseau | cache Hive (TTL par ressource : catégories 24 h, fiches pro 7 j) + bandeau « Mode hors ligne » |
| Publication besoin | brouillon sauvegardé (SCR-019) ; envoi en file, reprise auto |
| Message envoyé | file + état « envoi…/échec ▶ réessayer » (SCR-018) |
| Paiement | **jamais** mis en file seul : confirmation requise ; reprise = re-vérification de statut (idempotent, 12 §9) |
| Refresh token | si réseau : refresh silencieux ; sinon : session conservée, DLG-008 à la reconnexion |
| Upload photos | reprise avec pause/reprise, déduplication par hash |

---

## 7. Navigation & deeplinks

| Cible | Route (go_router) | Exemples de deeplink |
|---|---|---|
| Demande | `/requests/:id` | NT-001 → SCR-023 ; NT-003 → SCR-023 |
| Conversation | `/chat/:conversationId` | NT-005 |
| Booking | `/bookings/:id` | NT-006/008/009/010 |
| Fiche pro | `/professionals/:id` | NT-013 |
| Vérification pro | `/pro/verification` | NT-014/015 |
| Notifications | `/notifications` | générique |

Guards : `AuthGuard` (session), `RoleGuard` (client/pro/admin — app différente pour pro),
`LocaleGuard` (SCR-002 si jamais choisi).

---

## 8. Tests Flutter (résumé — détail `13-strategie-tests.md`)

| Type | Cible | Outil |
|---|---|---|
| Unit | ViewModels, validators, models (fromJson), utils | `flutter_test` |
| Controller | chaque controller avec repos mockés (tous les états) | `flutter_test` + `mocktail` |
| Widget | états visuels (skeleton, vide, erreur, succès), gestes | `flutter_test` |
| Golden | tokens/thème (fiabilité visuelle) | `golden_toolkit` |
| Integration | parcours P0 sur device (emulator, 3G throttling) | `integration_test` |
| E2E | full stack contre staging | `integration_test` + backend e2e |

---

## 9. Règles de parallélisation

1. 1 développeur = 1 flux de SCR (ex. « flux paiement ») ; le `core` est la seule zone de partage.
2. Ajout d'un écran : wireframe (07k) → contrat `07l` → controller+widget → tests → PR.
3. Interdiction : `setState` métier hors widget, logique dans le build, imports croisés entre features, hard-coded text (toujours ARB), couleurs hors tokens.
4. Chaque feature déclare ses dépendances au `core` uniquement (jamais à une autre feature).
