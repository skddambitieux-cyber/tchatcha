# Readiness pilote TCHATCHA — Cotonou–Abomey-Calavi

Version : 1.0 — contrôle ciblé post-FCT-016B2
Date : 2026-09-08
Périmètre : code réellement présent, migrations, routes, tests, infrastructure et
documents. Aucun statut n’est déduit de la seule documentation.

## 1. Synthèse

Préparation estimée : **environ 45 % pour un pilote réellement utilisable**.
Le backend couvre correctement l’authentification, les profils, le catalogue,
la recherche géographique, les demandes/devis, les réservations, les litiges et
les avis, avec des E2E dédiés. En revanche, il manque le produit lançable par un
client final : aucun projet Flutter n’est présent, aucune preuve de raccordement
mobile n’existe, et les notifications/messagerie n’ont pas de contrôleurs HTTP.
Le paiement est un simulateur et le parcours assisté TCHATCHA n’a pas de module
opérationnel de qualification/préselection.

Conclusion : **pas prêt pour un pilote client réel**. Un pilote backend démontré
par API peut être préparé, mais il faut d’abord livrer le socle mobile et le
parcours opérationnel assisté, puis encadrer explicitement le paiement simulé.

## 2. Matrice de readiness du parcours

| # | Élément | Statut | Preuve exacte | Blocage concret | Action minimale | Dépendances | Priorité |
|---:|---|---|---|---|---|---|---|
| 1 | Inscription/auth client-pro | fonctionnel | `auth.controller.ts` (`POST /auth/register`, `/login`, `/refresh`, `/logout`) ; `auth.e2e-spec.ts` | Aucun parcours mobile | Brancher les écrans et stocker les tokens de façon sûre | Flutter, config API | P0 |
| 2 | OTP et sessions | simulé | `console-sms.provider.ts`, `in-memory-otp.store.ts`, `typeorm-session.repository.ts` ; `auth.e2e-spec.ts` | SMS réel non branché ; secrets/config de production non fournis | Conserver le mode test pour démo, puis valider un provider SMS et un store persistant | Provider SMS, secrets, mobile | P0 |
| 3 | Profil professionnel | fonctionnel | `professionals.controller.ts` (`GET/PUT /professionals/me`, services, horaires, portfolio) ; `me-write.e2e-spec.ts` | Vérification humaine et onboarding mobile incomplets | Définir le happy path mobile et exécuter la vérification pilote | Admin, Flutter | P0 |
| 4 | Catalogue métiers | fonctionnel | `categories.controller.ts` (`GET /categories`) ; migrations `002-seed-catalogue-benin.ts`, `004-seed-pilot-communes.ts` | Pas de preuve de seed sur l’environnement de démonstration final | Migrer/seeder l’environnement pilote et vérifier les catégories | PostgreSQL | P0 |
| 5 | Localisation/zones | fonctionnel | `geo.controller.ts`, `public-catalogue-geo.e2e-spec.ts`, migrations `004`, PostGIS | Données réelles et couverture opérationnelle à valider | Charger les zones du couloir et tester quelques adresses terrain | PostGIS, données pilote | P0 |
| 6 | Recherche autonome | fonctionnel | `search.controller.ts` (`GET /search`), `search.e2e-spec.ts`, `projection.e2e-spec.ts` | Aucun client mobile ; disponibilité et données réelles à éprouver | Exposer la recherche dans le mobile et valider les résultats terrain | Flutter, projection, zones | P0 |
| 7 | Profils publics | fonctionnel | `professionals.controller.ts` (`GET /professionals/:id`), `public-catalogue-geo.e2e-spec.ts` | UX mobile absente | Implémenter fiche publique, badge, note et données de contact masquées | Flutter, API | P0 |
| 8 | Demande assistée TCHATCHA | documentaire uniquement | `docs/43-modele-operationnel-monetisation-pilote.md` ; backend `requests.controller.ts` ne matérialise qu’une demande client | Aucun rôle/processus de qualification TCHATCHA, SLA ou file de présélection | Créer une file admin/ops, statut de qualification et procédure manuelle tracée | Admin, demandes, audit | P0 |
| 9 | Présélection de 2–3 artisans | absent | Aucune route ou service de présélection identifié | Aucun moteur ou outil opérateur de sélection | Ajouter une action admin/ops manuelle avec critères zone, métier, disponibilité | Recherche, admin, données pilote | P1 |
| 10 | Demande directe artisan choisi | fonctionnel | `requests.controller.ts` (`POST /requests`, `POST /requests/:id/quotes`), `requests.e2e-spec.ts` | Mobile absent | Raccorder le formulaire et les états côté mobile | Flutter, auth | P0 |
| 11 | Devis, comparaison, modification | partiel | `quotes.controller.ts` (`GET`, `counter-offers`, `history`, `accept`) ; `quotes.e2e-spec.ts` | Pas d’écran de comparaison ni preuve de parcours complet mobile | Construire comparaison, contre-offre et historique côté mobile | Flutter, demandes | P0 |
| 12 | Sélection d’un devis | fonctionnel | `quotes.controller.ts` (`POST /quotes/:id/accept`) ; `quotes.e2e-spec.ts` | Pas d’interface client | Ajouter confirmation et gestion des erreurs dans le mobile | Flutter, réservation | P0 |
| 13 | Réservation/créneau | fonctionnel | `professional-slots.controller.ts`, `bookings.controller.ts`, migrations `010`, `012` ; `bookings.e2e-spec.ts` | Calendrier mobile et données de disponibilité réelles absents | Livrer sélection de créneau et confirmation côté mobile | Flutter, pros | P0 |
| 14 | Paiement simulé sécurisé | simulé | `payments.controller.ts` (`POST /payments/initiate`, `/verify`), `simulator-payment.gateway.ts`, `payments.e2e-spec.ts` | Aucun Mobile Money réel ; provider agréé et validation juridique manquants | Documenter le mode simulé, séparer secrets test/prod et tester le flux de démo | Paiement, juridique, mobile | P0 |
| 15 | Démarrage/suivi mission | partiel | `bookings.controller.ts` (`POST /bookings/:id/confirm`) ; `bookings-confirm.e2e-spec.ts` | Pas de suivi temps réel, notifications ni écran de mission | Implémenter états, écran mission et rafraîchissement minimal | Flutter, notifications | P1 |
| 16 | Double confirmation | fonctionnel | `bookings.controller.ts`, `bookings-confirm.e2e-spec.ts` | Seulement API ; expérience utilisateur absente | Ajouter les deux actions et le récapitulatif mobile | Flutter, paiement simulé | P0 |
| 17 | Litige | fonctionnel | `disputes.controller.ts`, `disputes.e2e-spec.ts` | Preuves/médias et suivi utilisateur non intégrés au mobile | Ajouter ouverture, pièces, état et retour support | Flutter, media, admin | P1 |
| 18 | Avis | fonctionnel | `review.controller.ts`, migration `016-review-moderation.ts`, `reviews.e2e-spec.ts` (15 tests) | Trust Score non recalculé par conception ; mobile absent | Exposer les avis, expliquer le Trust Score différé et livrer l’UI | Flutter, documentation produit | P1 |
| 19 | Notifications essentielles | absent | `notifications.module.ts` et entités, mais aucun `@Controller` de notifications | Aucun endpoint, push, SMS transactionnel ou centre de notifications | Créer au minimum événements et endpoint de lecture + canal pilote | Auth, messaging, provider | P0 |
| 20 | Administration minimale | partiel | `admin-verifications.controller.ts`, `AdminGuard`, routes review FCT-016B2 ; E2E admin/review | Pas de dashboard ops pour qualification, présélection, support et pilotage | Construire une console minimale ou runbook ops auditable | Admin, audit, demandes | P0 |
| 21 | Application Flutter Android | absent | Aucun `pubspec.yaml`, fichier `.dart`, manifeste Android ou projet mobile trouvé | Application impossible à lancer ou à connecter | Créer le projet Flutter, environnements, navigation et build Android | Flutter SDK, API, CI | P0 |
| 22 | Sécurité, démo, observabilité | partiel | `env.validation.ts`, `health.controller.ts`, `infra/docker/docker-compose.yml`, tests auth/config | Secrets dev par défaut, pas de données de démo opérables, observabilité applicative limitée | Séparer config test/pilote, seed contrôlé, logs/métriques/alertes et runbook | Infra, sécurité, ops | P0 |

## 3. Parcours validés à distinguer

### Parcours autonome

La capacité backend est présente : recherche `GET /search`, catalogue public et
profils publics ont des contrôleurs et des E2E. Le parcours n’est toutefois pas
utilisable par un client pilote tant qu’il n’existe pas d’application mobile
lançable, de données de démonstration validées et d’écran de demande directe.

### Parcours assisté

Le cadrage produit existe dans `docs/43-modele-operationnel-monetisation-pilote.md`,
mais aucune capacité exécutable ne reçoit, qualifie et présélectionne les
demandes pour TCHATCHA. Il faut au minimum un processus opérateur manuel,
auditable et outillé avant de présenter ce parcours comme disponible.

## 4. P0 ordonnés

1. Créer et raccorder l’application Flutter Android au backend, avec configuration
   d’environnement et parcours client/pro minimal.
2. Stabiliser l’environnement pilote : PostgreSQL/PostGIS, migrations, seed des
   métiers/zones/profils de démonstration et secrets non par défaut.
3. Livrer le parcours autonome mobile complet : recherche, profil, demande,
   devis, sélection et créneau.
4. Formaliser puis outiller le parcours assisté : file ops, qualification,
   présélection et choix final client.
5. Rendre le paiement simulé explicite et sûr pour la démo, sans suggérer de
   Mobile Money réel.
6. Ajouter les notifications essentielles et le centre de suivi minimal.
7. Fournir une administration minimale pour vérification, modération, support,
   qualification et métriques du pilote.
8. Compléter sécurité, données de démonstration, logs, métriques, sauvegarde et
   runbook d’exploitation.

## 5. Plan de petits lots techniques

| Lot | Contenu | Sortie vérifiable |
|---|---|---|
| R-01 | Scaffold Flutter, environnements dev/pilote, navigation, auth | `flutter build apk` et inscription/login sur API locale |
| R-02 | Catalogue, zones, seed contrôlé, recherche et profil public | recherche Cotonou/Calavi et fiche pro sur Android |
| R-03 | Demande directe, devis, comparaison, sélection, créneau | un scénario client→pro complet en mobile |
| R-04 | Console/processus ops assisté et présélection | demande qualifiée, 2–3 pros proposés, choix client tracé |
| R-05 | Paiement simulé, confirmations, états mission | scénario payé simulé→double confirmation sans provider réel |
| R-06 | Notifications essentielles et support litige | notification de demande/devis/confirmation et ouverture litige |
| R-07 | Données pilote, sécurité et observabilité | runbook, comptes démo, logs corrélés, métriques et alertes de base |
| R-08 | Répétition pilote limitée | parcours autonome et assisté exécutés par utilisateurs test à Cotonou–Calavi |

## 6. Critères précis de déclaration « prêt pilote »

- l’application Android s’installe et démarre depuis un build reproductible ;
- un client et un professionnel peuvent s’inscrire, vérifier l’OTP de démo et
  conserver une session ;
- les catégories, zones Cotonou–Calavi et comptes de démonstration sont seedés ;
- le parcours autonome recherche→profil→demande→devis→sélection→créneau est
  réalisé sans intervention technique ;
- le parcours assisté reçoit une demande, la qualifie, propose 2–3 artisans et
  laisse le client choisir ;
- le paiement est clairement affiché comme simulé et aucune route ne prétend
  encaisser du Mobile Money réel ;
- confirmations, notifications essentielles, litige et avis sont testés ;
- un admin peut vérifier, modérer, suivre une demande assistée et répondre à un
  incident ;
- aucune coordonnée personnelle n’est exposée avant l’étape autorisée ;
- logs, erreurs, sauvegarde, secrets et procédure de reprise sont vérifiés ;
- un test terrain limité atteint les objectifs Go/No-Go définis dans
  `docs/21-plan-pilote.md` sans incident grave.

## 7. Dépendances externes et éléments hors chemin critique

Le SMS réel, un prestataire financier agréé, Mobile Money, le stockage objet
réel, les push notifications et les éventuels services cartographiques restent
des dépendances à valider ou à simuler explicitement. Aucun paiement ne doit
utiliser un compte personnel du fondateur.

Le Journal TCHATCHA reste hors chemin critique du MVP. Ses publications,
sponsoring, interactions et statistiques ne doivent pas retarder les lots R-01
à R-08 ; au mieux, un prototype séparé sera évalué après la répétition du pilote.

Le Trust Score peut rester visible comme donnée existante, mais aucune formule
nouvelle ne doit être inventée. Son calcul, ses pondérations, son versionnement
et son recalcul relèvent d’un lot produit ultérieur explicitement validé.

## 8. Recommandation

Le prochain lot à développer est **R-01 — scaffold Flutter et raccordement API**,
accompagné de la préparation d’un environnement pilote contrôlé. Il débloque la
preuve utilisateur des deux parcours sans élargir le périmètre au Journal ni au
Mobile Money réel. R-02 et R-03 doivent suivre avant tout pilote externe ; R-04
est indispensable pour annoncer honnêtement le parcours assisté.
