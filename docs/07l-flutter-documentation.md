# Documentation Flutter — Contrats techniques par écran

Pas de code. Pour chaque écran : nom du Widget, route, Controller associé,
UseCases appelés, Repositories utilisés, Entités manipulées, États de l'écran,
Événements utilisateur. Ces contrats sont la base du développement (Étape 5).

Conventions :
- Architecture : Riverpod (StateNotifier/AsyncNotifier) + Repository Pattern.
- Noms de fichiers : `features/<flux>/<écran>_screen.dart`, `_controller.dart`.
- Entités = modèles de domaine mobile (miroir des entités backend).
- Les UseCases côté mobile correspondent aux endpoints API (contrats `08-api.md`).

---

## FLOW A — Auth

### SCR-001 — SplashScreen
| Champ | Valeur |
|---|---|
| Widget | `SplashScreen` (mobile/apps/client/lib/features/auth/splash_screen.dart) |
| Route | `/splash` (racine) |
| Controller | `SplashController` |
| UseCases | `CheckSession` (refresh token valide ?) |
| Repositories | `AuthRepository` |
| Entités | `Session`, `User` |
| États | `splash.loading` → `splash.authenticated` (→ /home) / `splash.anonymous` (→ /onboarding) / `splash.offline` (session locale) |
| Événements | `onSplashLoaded`, `onSessionExpired` |

### SCR-002 — LanguageCountryScreen
| Champ | Valeur |
|---|---|
| Widget | `LanguageCountryScreen` |
| Route | `/onboarding/locale` |
| Controller | `LocaleController` |
| UseCases | `SaveLocale`, `DetectCountry` (GPS/SIM) |
| Repositories | `SettingsRepository` |
| Entités | `AppLocale`, `Country` |
| États | `locale.loaded`, `locale.saving` |
| Événements | `onLanguageSelected`, `onCountrySelected`, `onContinue` |

### SCR-003 — LoginScreen
| Champ | Valeur |
|---|---|
| Widget | `LoginScreen` |
| Route | `/auth/login` |
| Controller | `LoginController` |
| UseCases | `RequestOtp(phone)`, `VerifyOtp(phone, code)` |
| Repositories | `AuthRepository` |
| Entités | `OtpChallenge`, `Session`, `User` |
| États | `login.idle`, `login.requesting`, `login.awaitingOtp` (compte à rebours), `login.verifying`, `login.authenticated`, `login.locked` |
| Événements | `onPhoneSubmitted`, `onOtpChanged` (auto-advance), `onResendTimer`, `onLogin` |

### SCR-004 — RegisterScreen (wizard WIZ-001)
| Champ | Valeur |
|---|---|
| Widget | `RegisterScreen` (3 étapes internes) |
| Route | `/auth/register` |
| Controller | `RegisterController` |
| UseCases | `SelectRole`, `RequestOtp`, `VerifyOtp`, `CreateUser`, `AcceptConsents` |
| Repositories | `AuthRepository`, `UserRepository` |
| Entités | `User`, `OtpChallenge`, `Consent` |
| États | `register.step(1..3)`, `register.verifying`, `register.created`, `register.progressSaved` |
| Événements | `onRoleSelected`, `onOtpSubmitted`, `onConsentsToggled`, `onCreate` |

## FLOW B — Accueil & recherche

### SCR-005 — HomeScreen
| Champ | Valeur |
|---|---|
| Widget | `HomeScreen` |
| Route | `/home` (onglet 1) |
| Controller | `HomeController` |
| UseCases | `GetHomeFeed` (catégories, pros populaires, promos, nouveaux, restaurants proches) |
| Repositories | `CatalogRepository`, `SearchRepository` (feed), `GeolocationRepository` |
| Entités | `Category`, `ProfessionalSummary`, `Promotion`, `RestaurantSummary` |
| États | `home.loading` (skeleton), `home.data`, `home.cached` (offline), `home.empty` |
| Événements | `onSearchTap`, `onCategoryTap`, `onProTap`, `onViewAll`, `onPullRefresh`, `onLocationUpdated` |

### SCR-007 — SearchScreen
| Champ | Valeur |
|---|---|
| Widget | `SearchScreen` |
| Route | `/search` (onglet 2) |
| Controller | `SearchController` |
| UseCases | `Autocomplete(query)`, `GetRecentSearches`, `ClearHistory` |
| Repositories | `SearchRepository`, `LocalHistoryRepository` |
| Entités | `SearchSuggestion` |
| États | `search.idle`, `search.typing` (debounce), `search.suggesting`, `search.emptyHistory` |
| Événements | `onQueryChanged`, `onSuggestionTap`, `onHistoryTap`, `onVoiceTap` (P3) |

### SCR-008 — SearchResultsScreen
| Champ | Valeur |
|---|---|
| Widget | `SearchResultsScreen` |
| Route | `/search/results?query=…&lat=…&lon=…` |
| Controller | `SearchResultsController` |
| UseCases | `SearchPros(query, filters, pageKey)` |
| Repositories | `SearchRepository` |
| Entités | `ProfessionalSummary`, `SearchFilters`, `Page` (keyset) |
| États | `results.loading`, `results.data`, `results.loadingMore`, `results.empty`, `results.error` |
| Événements | `onFilterApply`, `onSortChange`, `onProTap`, `onLoadMore`, `onMapToggle`, `onRefresh` |

### SCR-009 — MapScreen
| Champ | Valeur |
|---|---|
| Widget | `MapScreen` |
| Route | `/search/map` |
| Controller | `MapController` |
| UseCases | `SearchPros(geoBounds)`, `ReverseGeocode` |
| Repositories | `SearchRepository`, `MapRepository` (MapLibre) |
| Entités | `ProfessionalSummary`, `GeoPoint`, `MapBounds` |
| États | `map.loading`, `map.data`, `map.clustered`, `map.permissionDenied` |
| Événements | `onCameraMoved` (debounce), `onPinTap`, `onClusterTap`, `onRecenter`, `onRadiusChange` |

## FLOW C — Publication d'un besoin

### SCR-019/020 — CreateRequestScreen (wizard WIZ-002)
| Champ | Valeur |
|---|---|
| Widget | `CreateRequestScreen` (2 étapes) |
| Route | `/requests/new` |
| Controller | `CreateRequestController` |
| UseCases | `GetCategories` (arbre), `UploadMedia` (S3 signé), `CreateRequest(draft)` |
| Repositories | `CatalogRepository`, `MediaRepository`, `RequestRepository` |
| Entités | `ServiceRequestDraft`, `Category`, `Media`, `GeoPoint`, `Budget` |
| États | `draft.step1`, `draft.step2`, `draft.uploading(progress)`, `draft.validating`, `draft.submitting`, `draft.savedLocally`, `draft.queued` (offline) |
| Événements | `onCategorySelected`, `onPhotosAdded`, `onUploadRetry`, `onBudgetChanged`, `onDateSelected`, `onLocationPicked`, `onPublish` |

### SCR-021 — RequestCreatedScreen
| Champ | Valeur |
|---|---|
| Widget | `RequestCreatedScreen` |
| Route | `/requests/created/:id` |
| Controller | `RequestDetailController` (réutilisé) |
| UseCases | `GetRequest(id)`, `SubscribeRequest(id)` (events) |
| Repositories | `RequestRepository`, `RealtimeRepository` (websocket) |
| Entités | `ServiceRequest`, `RequestStatus` |
| États | `created.animating`, `created.data`, `created.error` |
| Événements | `onViewRequest`, `onGoHome` |

## FLOW D — Devis, sélection, paiement

### SCR-022 — RequestDetailScreen
| Champ | Valeur |
|---|---|
| Widget | `RequestDetailScreen` |
| Route | `/requests/:id` |
| Controller | `RequestDetailController` |
| UseCases | `GetRequest`, `GetQuotes(requestId)`, `CancelRequest`, `ReopenRequest`, `Subscribe` |
| Repositories | `RequestRepository`, `QuoteRepository` |
| Entités | `ServiceRequest`, `Quote`, `RequestStatus` |
| États | `detail.loading`, `detail.data(status)`, `detail.live` (maj en temps réel), `detail.cancelled`, `detail.emptyQuotes` |
| Événements | `onQuoteTap`, `onCompare`, `onCancelRequest`, `onReopen`, `onNewQuoteReceived` (push) |

### SCR-023 — QuoteDetailScreen
| Champ | Valeur |
|---|---|
| Widget | `QuoteDetailScreen` |
| Route | `/quotes/:id` |
| Controller | `QuoteDetailController` |
| UseCases | `GetQuote`, `AcceptQuote`, `CreateCounterOffer` |
| Repositories | `QuoteRepository`, `ProfessionalRepository` |
| Entités | `Quote`, `ProfessionalSummary` |
| États | `quote.loading`, `quote.data`, `quote.accepted`, `quote.withdrawn` |
| Événements | `onAccept`, `onCounterOffer`, `onChat` |

### SCR-024 — NegotiationScreen
| Champ | Valeur |
|---|---|
| Widget | `NegotiationScreen` |
| Route | `/quotes/:id/negotiate` |
| Controller | `NegotiationController` |
| UseCases | `CreateCounterOffer(quoteId, price, message)` |
| Repositories | `QuoteRepository` |
| Entités | `Quote`, `NegotiationTurn` |
| États | `nego.sending`, `nego.sent`, `nego.failed` |
| Événements | `onPriceChanged`, `onSend` |

### SCR-025 — ConfirmSelectionScreen
| Champ | Valeur |
|---|---|
| Widget | `ConfirmSelectionScreen` |
| Route | `/quotes/:id/select` |
| Controller | `SelectionController` |
| UseCases | `SelectQuote(quoteId)` |
| Repositories | `QuoteRepository` |
| Entités | `Quote` |
| États | `selection.confirming`, `selection.done` |
| Événements | `onConfirm` |

### SCR-026 — SlotPickerScreen
| Champ | Valeur |
|---|---|
| Widget | `SlotPickerScreen` |
| Route | `/bookings/new?quoteId=…` |
| Controller | `SlotPickerController` |
| UseCases | `GetAvailableSlots(proId, month)`, `CreateBooking(slot)` |
| Repositories | `AvailabilityRepository`, `BookingRepository` |
| Entités | `AvailabilitySlot`, `Booking` |
| États | `slots.loading`, `slots.month`, `slots.booked`, `slots.conflict` |
| Événements | `onMonthChange`, `onSlotSelected`, `onBook` |

### SCR-027 — PaymentScreen
| Champ | Valeur |
|---|---|
| Widget | `PaymentScreen` |
| Route | `/bookings/:id/pay` |
| Controller | `PaymentController` |
| UseCases | `InitiatePayment(bookingId, method)`, `VerifyPayment`, `SavePaymentMethod` |
| Repositories | `PaymentRepository` |
| Entités | `Transaction`, `PaymentMethod`, `PaymentStatus` |
| États | `pay.methodSelect`, `pay.processing`, `pay.success`, `pay.failed`, `pay.webhookPending` |
| Événements | `onMethodSelected`, `onPay`, `onRetry`, `onFallbackCash` |

### SCR-028 — BookingProgressScreen
| Champ | Valeur |
|---|---|
| Widget | `BookingProgressScreen` |
| Route | `/bookings/:id` |
| Controller | `BookingController` |
| UseCases | `GetBooking`, `ConfirmCompletion`, `OpenDispute` |
| Repositories | `BookingRepository`, `DisputeRepository` |
| Entités | `Booking`, `BookingStatus` |
| États | `booking.data(status timeline)`, `booking.confirmed`, `booking.disputed` |
| Événements | `onConfirmDone`, `onDispute`, `onNavigate` |

### SCR-031 — ReviewScreen
| Champ | Valeur |
|---|---|
| Widget | `ReviewScreen` |
| Route | `/bookings/:id/review` |
| Controller | `ReviewController` |
| UseCases | `CreateReview(bookingId, ratings, comment, media)` |
| Repositories | `ReviewRepository`, `MediaRepository` |
| Entités | `Review`, `ReviewCriteria` |
| États | `review.rating`, `review.submitting`, `review.submitted` |
| Événements | `onRatingChange`, `onCommentChanged`, `onSubmit` |

## FLOW E — Fiche pro

### SCR-011 — ProfessionalDetailScreen
| Champ | Valeur |
|---|---|
| Widget | `ProfessionalDetailScreen` |
| Route | `/professionals/:id` |
| Controller | `ProfessionalDetailController` |
| UseCases | `GetProfessional(id)`, `GetReviews(id)`, `GetPortfolio(id)`, `GetAvailabilityToday`, `ToggleFavorite` |
| Repositories | `ProfessionalRepository`, `ReviewRepository`, `FavoriteRepository` |
| Entités | `Professional`, `Review`, `MediaItem`, `Availability` |
| États | `pro.loading`, `pro.data`, `pro.offlineCache`, `pro.suspended` |
| Événements | `onCall`, `onWhatsApp`, `onChat`, `onRequestQuote`, `onFavorite` (double tap), `onHeroTap` |

## FLOW F/G — Pro

### SCR-077 — ProDashboardScreen
| Champ | Valeur |
|---|---|
| Widget | `ProDashboardScreen` |
| Route | `/pro/home` |
| Controller | `ProDashboardController` |
| UseCases | `GetTodayOverview`, `GetLatestRequests` |
| Repositories | `RequestRepository`, `BookingRepository` |
| Entités | `RequestSummary`, `Booking` |
| États | `dash.loading`, `dash.data`, `dash.empty` |
| Événements | `onRespond`, `onTileTap`, `onRefresh` |

### SCR-078 — ProRequestsScreen
| Champ | Valeur |
|---|---|
| Widget | `ProRequestsScreen` |
| Route | `/pro/requests` |
| Controller | `ProRequestsController` |
| UseCases | `GetMatchingRequests(filters)`, `SubscribeMatching` |
| Repositories | `RequestRepository`, `RealtimeRepository` |
| Entités | `RequestSummary`, `RequestStatus` |
| États | `list.loading`, `list.data`, `list.live`, `list.empty` |
| Événements | `onRespond`, `onFilter`, `onLoadMore` |

### SCR-080 — CreateQuoteScreen (pro)
| Champ | Valeur |
|---|---|
| Widget | `CreateQuoteScreen` |
| Route | `/pro/requests/:id/quote` |
| Controller | `CreateQuoteController` |
| UseCases | `CreateQuote(requestId, price, duration, message)` |
| Repositories | `QuoteRepository` |
| Entités | `Quote` |
| États | `quote.sending`, `quote.sent`, `quote.failed` |
| Événements | `onPriceChanged`, `onSend` |

### SCR-082 — ProCalendarScreen
| Champ | Valeur |
|---|---|
| Widget | `ProCalendarScreen` |
| Route | `/pro/calendar` |
| Controller | `ProCalendarController` |
| UseCases | `GetBookingsMonth`, `AddOverride`, `UpdateSlots` |
| Repositories | `BookingRepository`, `AvailabilityRepository` |
| Entités | `Booking`, `AvailabilityOverride` |
| États | `cal.loading`, `cal.month`, `cal.daySelected` |
| Événements | `onMonthChange`, `onBookingTap`, `onAddUnavailable` |

### SCR-085 — ProEarningsScreen
| Champ | Valeur |
|---|---|
| Widget | `ProEarningsScreen` |
| Route | `/pro/earnings` |
| Controller | `ProEarningsController` |
| UseCases | `GetWallet`, `GetTransactionHistory`, `RequestPayout` |
| Repositories | `PaymentRepository` |
| Entités | `Wallet`, `Transaction`, `Payout` |
| États | `earn.loading`, `earn.data`, `earn.requesting`, `earn.queued` |
| Événements | `onWithdraw`, `onHistoryTap` |

### SCR-086 — ProStatsScreen
| Champ | Valeur |
|---|---|
| Widget | `ProStatsScreen` |
| Route | `/pro/stats` |
| Controller | `ProStatsController` |
| UseCases | `GetReputationMetrics`, `GetStatsPeriod` |
| Repositories | `ProfessionalRepository` |
| Entités | `Reputation`, `TrustScore`, `StatsSeries` |
| États | `stats.loading`, `stats.data`, `stats.insufficientData` |
| Événements | `onPeriodChange`, `onTipTap` |

## FLOW H — Admin (web)

### SCR-121 — AdminDashboardScreen
| Champ | Valeur |
|---|---|
| Widget | `AdminDashboardScreen` |
| Route | `/admin` |
| Controller | `AdminDashboardController` |
| UseCases | `GetNationStats(country)`, `GetPendingCounts` |
| Repositories | `AdminRepository` |
| Entités | `StatsSnapshot`, `PendingCounts` |
| États | `admin.loading`, `admin.data`, `admin.empty` |
| Événements | `onCountryChange`, `onQueueTap` |

### SCR-122 — AdminVerificationScreen
| Champ | Valeur |
|---|---|
| Widget | `AdminVerificationScreen` |
| Route | `/admin/verifications` |
| Controller | `AdminVerificationController` |
| UseCases | `GetPendingVerifications`, `ApproveVerification`, `RejectVerification` |
| Repositories | `AdminRepository`, `MediaRepository` |
| Entités | `Verification`, `Professional` |
| États | `verify.list`, `verify.detail`, `verify.deciding` |
| Événements | `onApprove`, `onReject` (+ motif) |

### SCR-124 — AdminDisputesScreen
| Champ | Valeur |
|---|---|
| Widget | `AdminDisputesScreen` |
| Route | `/admin/disputes` |
| Controller | `AdminDisputeController` |
| UseCases | `GetDisputes`, `ResolveDispute(decision)` |
| Repositories | `AdminRepository`, `DisputeRepository` |
| Entités | `Dispute`, `DisputeDecision` |
| États | `disputes.list`, `disputes.detail`, `disputes.deciding` |
| Événements | `onResolve` |

---

## Règles transverses Flutter

1. **Un écran = un Widget + un Controller** (Riverpod) ; pas de logique métier dans le Widget.
2. **UseCases** : un appel API = un use-case nommé ; le Controller orchestre.
3. **Entités** : immuables (`freezed`), JSON de l'API converti par `fromJson`.
4. **États** : chaque écran expose `AsyncValue` (loading/data/error) + sous-états métier.
5. **Événements** : chaque interaction utilisateur est une méthode du Controller (testable).
6. Routes : constantes centralisées (`routes.dart`) ; deep links depuis les notifications (SCR cible).
7. Le contrat technique de chaque écran sera **généré à partir des wireframes validés** (07i/07j) avant l'Étape 5.
