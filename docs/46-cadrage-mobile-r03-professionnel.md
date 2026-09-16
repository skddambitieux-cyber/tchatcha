# Cadrage mobile R-03 — Artisan / professionnel

Version de cadrage — contrats vérifiés dans le backend présent sur `develop`.

Ce document décrit le parcours à implémenter plus tard. Il ne modifie ni le
backend, ni le mobile, ni les données de démonstration.

## 1. Verdict

Le backend est suffisamment présent pour démarrer un R-03C limité (demandes
correspondantes) et un R-03D limité (création et suivi des devis). Le parcours
professionnel complet n’est pas prêt pour R-03A : l’inscription est exploitable
mais son contrat est ambigu pour la localité, et aucun parcours Flutter
professionnel n’est encore raccordé.

R-03A est donc **pas prêt : R-03A0 doit être exécuté en premier**. Il faut
fermer les ambiguïtés de localité, OTP de démonstration et publication avant de
livrer l’authentification/routage par rôle.

## 2. Contrats backend disponibles

Toutes les routes ci-dessous sont préfixées par `/api/v1`.

### Authentification et compte

Disponibles :

- `POST /auth/otp/request` — `country_code`, `phone`, `purpose`, `device`
  optionnel ; réponse `202`.
- `POST /auth/otp/verify` — vérification LOGIN ou REGISTER ; réponse `200`.
- `POST /auth/register` — réponse `201` avec tokens et utilisateur.
- `POST /auth/refresh` — rotation du refresh opaque en base ; réponse `200`.
- `POST /auth/logout`, `POST /auth/logout-all` — révocation ; `204`.
- `GET /me` — projection du compte et des rôles ; authentifié.
- `PUT /me` — identité, locale, email, avatar et `version` ; authentifié.

`RegisterDto` accepte `country_code`, `phone`, `full_name`, `role`,
`consents.cgv` obligatoire, puis `category_id`, `division_id`, `locality_id`,
`device` et les champs livreur optionnels. Le service réel impose, pour le rôle
`PROFESSIONAL`, une catégorie et une localité ; la division est transmise mais
peut être vide. Le DTO déclare ces trois identifiants comme chaînes
optionnelles : cette incohérence doit être résolue avant l’UX finale.

Le compte passe de `PENDING_OTP` à `ACTIVE` après OTP REGISTER vérifié et
consentement CGV. Un téléphone déjà actif produit `PhoneAlreadyActiveError`.
Un compte professionnel existant doit donc suivre LOGIN, jamais REGISTER. La
règle métier BR-002 autorise plusieurs rôles sur une même identité, mais le
service d’inscription verrouille le rôle de cette activation et aucune route
publique actuelle n’ajoute un second rôle. Le mobile ne doit pas simuler un
changement de rôle.

L’interface doit charger pays, divisions et catégories puis afficher les noms.
Elle ne doit jamais demander à l’utilisateur de saisir un UUID. `GET
/geo/countries` et `GET /geo/countries/:code/divisions?type=...` sont publics ;
`GET /categories?country_code=BJ` est disponible. Il n’existe pas de route
locale dédiée explicitement vérifiée : le mapping division/localité doit être
confirmé côté produit avant R-03A.

Le `DeviceIdProvider`, `SessionStore`, `SessionController`, le Bearer et le
refresh R-02A sont réutilisés. Après connexion ou inscription, le mobile appelle
`GET /me`, lit `roles` et `professional`, puis route explicitement. Aucun
fallback silencieux CLIENT → PROFESSIONAL n’est acceptable.

### Profil professionnel

Routes réelles :

| Fonction | Route | État pour R-03 |
|---|---|---|
| Ma vitrine | `GET /professionals/me` | disponible, privé/authentifié |
| Modifier vitrine | `PUT /professionals/me` | disponible, `version` obligatoire |
| Créer service | `POST /professionals/me/services` | disponible, catégorie feuille et prix contrôlés |
| Modifier service | `PUT /professionals/me/services/:id` | disponible, `version` obligatoire |
| Supprimer service | `DELETE /professionals/me/services/:id` | disponible, sans promotion implicite |
| Horaires | `PUT /professionals/me/business_hours` | disponible, remplacement atomique |
| Localisation | `PUT /professionals/me/location` | disponible, coordonnées privées dans `/me` |
| Portfolio | `GET /professionals/me/portfolio` | disponible, pagination offset |
| Portfolio modifier/supprimer/confirmer | `PUT/DELETE/POST /professionals/me/portfolio/:id...` | disponible mais média/S3 à intégrer |
| Vérification | `GET /professionals/me/verification`, `POST /professionals/me/verifications` | disponible, revue admin nécessaire |
| Réputation | `GET /professionals/me/reputation` | disponible en lecture |
| Fiche publique | `GET /professionals/:id` | disponible, projection publique |

`GET /professionals/me` expose davantage de données au propriétaire :
`user_id`, localisation avec latitude/longitude et `address_text`, services,
horaires, portfolio et réputation. La fiche publique exclut les données
personnelles exactes et les clés S3 ; elle expose commune, rayon, services,
portfolio public et réputation filtrée. Le mobile doit séparer clairement
`ProfessionalMe` et `PublicProfessional`.

Indispensable pilote : vitrine, au moins un service actif, catégorie, commune ou
localité validée, horaires simples, état vérifié/non vérifié, réputation et
gestion de version. Reportable : portfolio, réseaux sociaux, site web et
réputation détaillée. Bloqué/à préciser : upload de média, URL de portfolio,
workflow de vérification humaine et choix localité/division.

### Demandes correspondantes

- `GET /requests/matched?limit=&cursor=` — authentifié, professionnel publiable
  requis ; pagination keyset.
- `GET /requests/matched/:id` — détail d’une demande effectivement matchée.

Une demande est éligible si elle est `OPEN`, non expirée, dans le même pays,
avec catégorie identique à l’arbre de services du professionnel, et :

- localisation ponctuelle dans le rayon du professionnel ; ou
- absence de point et même division.

Le professionnel doit avoir un profil `ACTIVE`, un utilisateur `ACTIVE`, le
rôle `PROFESSIONAL`, une fiche de recherche reconstruite et une localisation.
La vérification n’est pas une condition d’apparition ; le badge est un facteur
de confiance/tri. La réponse contient titre, description, catégorie, commune,
distance arrondie, budget, devise, urgence, date et expiration. Elle ne contient
pas le téléphone, l’email, le nom du client, son adresse exacte ni ses
coordonnées.

Écrans : liste avec chargement, vide, erreur/retry, pagination et expiration ;
détail avec état obsolète si la demande disparaît. Aucun contact hors
plateforme ne doit être proposé.

### Devis professionnel

Routes réelles :

- `POST /requests/:id/quotes` — professionnel publiable ; `price` obligatoire
  (1 à 999999999999.99, deux décimales), `duration_days` optionnel (1–365),
  `message` optionnel (1–2000), `Idempotency-Key` UUID obligatoire ; réponse
  de devis `PENDING`.
- `GET /quotes/sent?limit=&cursor=` — devis envoyés par le professionnel.
- `GET /quotes/:id` — détail accessible au client ou au professionnel concerné.
- `POST /quotes/:id/withdraw` — `version`, tant que la transition le permet.
- `POST /quotes/:id/counter-offers` — mêmes champs, `version` et
  `Idempotency-Key` ; contre-offres bornées à quatre par paire.
- `GET /quotes/:id/history` — historique de la chaîne.

La création vérifie le match, l’état de la demande, l’unicité d’un devis actif
par professionnel/demande et l’idempotence. Les statuts observables incluent
`PENDING`, `COUNTERED`, `ACCEPTED`, `REJECTED` et `WITHDRAWN`. Une demande peut
devenir `QUOTED` ou `NEGOTIATING`. Le prix hors budget est autorisé mais marqué
`out_of_budget` dans le détail. Un devis accepté ne se retire ni ne se modifie.

Le mobile doit traiter `400` (DTO/idempotence), `401` (refresh puis replay),
`403` (rôle/accès), `404` (demande non matchée ou devis absent), `409`
(version, concurrence, doublon ou idempotence contradictoire) et `500` par
messages français assainis. Double appui : désactivation UI et clé stable.
Retry après timeout : même clé et même corps ; ne jamais fabriquer un second
devis.

Les routes client de sélection/acceptation existent (`POST /quotes/:id/accept`)
mais ne sont pas une action professionnelle. Les créneaux existent sous
`GET /professionals/:id/slots`; les réservations existent côté backend, mais
leur parcours mobile professionnel n’est pas cadré ici.

## 3. Navigation Flutter proposée

Après `/me`, un shell professionnel distinct peut proposer :

1. Tableau de bord : profil publiable, vérification, réputation et raccourcis.
2. Demandes disponibles : `requests/matched` avec pagination.
3. Détail demande : données client masquées, bouton « Envoyer un devis ».
4. Formulaire devis : prix, délai, message, confirmation et résultat.
5. Mes devis : `quotes/sent`, statut, expiration et curseur.
6. Détail/historique : `quotes/:id` et `quotes/:id/history`, retrait et
   contre-offre si l’état/acteur l’autorise.
7. Profil : vitrine, services, horaires, localisation, réputation ; portfolio
   et vérification en écrans séparés/reportés.
8. Déconnexion : révocation puis nettoyage sécurisé de session.

Une navigation inférieure à quatre ou cinq sections est acceptable si elle ne
duplique pas le parcours Client : Accueil, Demandes, Devis, Profil. Les écrans
de détail restent poussés dans la pile. Les pages ne connaissent que des
repositories/controllers ; elles ne construisent ni URL complète, ni headers,
ni JSON brut.

Arborescence justifiée : `features/professional_auth`,
`professional_home`, `matched_requests`, `quotes`,
`professional_profile`, plus modèles/repositories/controllers/pages locaux à
chaque feature. Les primitives `ApiClient`, `SessionController`,
`SessionStore` et `DeviceIdProvider` restent partagées.

## 4. Sécurité et anti-contournement

- Stocker access/refresh uniquement via le stockage sécurisé R-02A ; jamais dans
  logs, route, modèle d’UI ou analytics.
- Toute route professionnelle reste protégée par le Bearer et vérifie le rôle
  réel côté serveur. Le mobile masque les actions non pertinentes, sans tenir
  cette UI pour une autorisation.
- Ne jamais afficher téléphone, email, adresse exacte, latitude/longitude du
  client, token, OTP, secret ou UUID saisi.
- Les demandes correspondantes ne montrent pas l’identité du client. Le
  contact reste dans les mécanismes de la plateforme et après les états métier
  autorisés ; pas de WhatsApp, téléphone ou paiement hors plateforme.
- Assainir les erreurs : code métier localisé, détail technique seulement dans
  les logs serveur contrôlés. Retry idempotent et verrouillage optimiste pour
  les devis/profil.
- Flutter consomme exclusivement l’API ; aucune donnée Supabase directe.

## 5. Données DEMO_R02

Les six professionnels synthétiques existants peuvent se connecter seulement
si un OTP REGISTER a été provisionné ; leurs lignes seedées directement sont
`ACTIVE` et n’ont pas nécessairement un OTP récent dans le store mémoire. Pour
un test de connexion réel, prévoir plus tard un seed/fixture qui crée un compte
`PENDING_OTP`, déclenche `ConsoleSmsProvider`, puis vérifie le code de démo sans
réutiliser de numéro réel. Le script local DEMO_R02 reste idempotent et séparé
du cadrage ; aucune modification n’est faite ici.

Préserver les demandes et comptes Client existants. Tout futur nettoyage devra
cibler exclusivement le marqueur DEMO_R02 et la base locale `tchatcha_e2e`.

## 6. Découpage recommandé

### R-03A — rôle, inscription et tableau de bord

- Objectif téléphone : inscrire ou connecter un professionnel, restaurer la
  session et ouvrir le shell correspondant au rôle réel.
- Endpoints : auth OTP/register/login/refresh/logout, `/me`, catégories,
  pays/divisions.
- Fichiers probables : `professional_auth`, routeur/session, modèles auth et
  tests widgets/contrats.
- Dépendances : décision localité/division, fixture OTP, comptes de test.
- Acceptation : CGV obligatoire, aucune UUID saisie, compte actif après OTP,
  rôle explicite, restauration après relance, aucun fallback silencieux.
- Risques : DTO optionnels contre règles service, compte déjà actif, rôle
  multiple non provisionné.

### R-03B — profil, services, horaires et localisation

- Objectif : rendre la vitrine publiable et la maintenir avec `version`.
- Endpoints : `/professionals/me`, services, business_hours, location.
- Tests : validations catégorie feuille, prix, horaires, conflits `409`,
  confidentialité de la localisation.
- Report : portfolio/upload et vérification humaine si le stockage/média n’est
  pas branché.

### R-03C — demandes correspondantes

- Objectif : voir uniquement les demandes matchées et leur détail masqué.
- Endpoints : `/requests/matched` et `/:id`.
- Tests : catégorie, division/rayon, demande expirée, rôle, curseur, vide,
  retry et absence de PII.

### R-03D — devis et négociation

- Objectif : envoyer, retrouver, retirer et négocier un devis sans doublon.
- Endpoints : création sous `/requests/:id/quotes`, `/quotes/sent`, détail,
  retrait, contre-offres, historique.
- Tests : idempotence, double appui, concurrence/version, transitions, prix hors
  budget, erreurs 400/401/403/404/409/500.
- Dépendances : R-03C et demandes synthétiques ouvertes.

### R-03E — portfolio, vérification, réputation

- Objectif : compléter la confiance professionnelle.
- Endpoints : portfolio, vérification, réputation existants.
- Report : upload/média S3, revue admin, formule de Trust Score et avis publics
  tant que le contrat produit n’est pas stabilisé.

## 7. Matrice de tests

| Domaine | Tests attendus |
|---|---|
| Auth/rôle | OTP REGISTER/LOGIN, compte actif, rôle, session restaurée, logout |
| HTTP | DTO exacts, mapping nullable, statuts et messages français |
| Recherche | match catégorie/zone/rayon, expiration, pagination, vide, retry |
| Devis | clé d’idempotence, replay 401, double soumission, concurrence, transitions |
| Confidentialité | aucune PII client, coordonnée exacte ou secret dans UI/logs |
| Autorisation | CLIENT refusé sur routes pro, pro non publiable refusé, accès devis isolé |
| Résilience | timeout, réponse obsolète, annulation, action répétée |
| E2E local | `tchatcha_e2e`, comptes synthétiques, demandes ouvertes, nettoyage marqué |
| Visuel | validation groupée sur BV4800 après plusieurs lots, pas à chaque écran isolé |

Les tests unitaires/widget ne dépendent ni d’un téléphone ni d’une API distante.
Les tests HTTP utilisent des transports faux et n’insèrent jamais de token ou
numéro réel. Les E2E locaux réutilisent les fixtures existantes et nettoient
leurs préfixes sans toucher aux données Client.

## 8. Contradictions et décisions ouvertes

1. Les documents fonctionnels parlent d’un onboarding professionnel complet,
   mais le mobile R-02 ne contient pas ce parcours ; R-03A doit le créer.
2. `RegisterDto` rend catégorie/division/localité optionnels alors que le
   service exige catégorie et localité pour PROFESSIONAL. Décider si le
   backend rend ces champs obligatoires ou si l’UI reçoit une localité valide.
3. `GET /geo/.../divisions` expose pays et divisions, pas une route localité
   dédiée vérifiée. Décider le niveau géographique réellement choisi.
4. BR-002 autorise les rôles multiples, mais aucune API d’ajout de rôle n’est
   disponible ; ne pas promettre ce parcours au mobile.
5. La vérification exige une revue admin et des médias ; elle ne peut pas être
   présentée comme instantanée après inscription.
6. Le Trust Score et ses impacts documentaires ne constituent pas une formule
   mobile à recalculer ; afficher uniquement les champs retournés.
7. Le modèle opérationnel évoque présélection, notifications, messagerie et
   paiement, mais les contrôleurs correspondants ne forment pas un parcours
   professionnel mobile complet. Aucun écran ne doit les simuler.
8. Le backend permet contre-offres et historique, mais les transitions sont
   sensibles à l’acteur et à la version ; les écrans doivent attendre le
   contrat de réponse réel.

Ce qui empêcherait concrètement R-03A : absence de décision localité/division,
absence de fixture OTP professionnelle testable et absence de réponse produit
sur le moment où la visibilité professionnelle devient publiable.

## 9. Décisions R-03A0 à fermer avant R-03A

### Décision 1 — division puis localité

Décision recommandée : afficher d’abord `Cotonou` ou `Abomey-Calavi`, puis une
localité/quartier par libellé. Le mobile conserve les identifiants reçus mais
n’en affiche ni n’en demande aucun. Il ne substitue jamais silencieusement
`division_id` à `locality_id`.

État backend réel : `GET /geo/countries/:code/divisions` accepte seulement
`type=DEPARTMENT|COMMUNE` et aucun endpoint de localités/quartiers n’a été
identifié. `RegisterDto` transporte `division_id` et `locality_id`, mais les
déclare optionnels ; `ProfileService` exige `category_id` et `locality_id` pour
un professionnel et transmet les deux identifiants. La vitrine et la recherche
stockent/recherchent actuellement `division_id` dans `pros.locations`.

Écart : le contrat ne permet pas de sélectionner et vérifier une localité
distincte. Le pilote doit rester limité aux deux communes.

Décision/lot : **R-03A0**. Ajouter avant R-03A un endpoint public minimal
`GET /geo/countries/:code/localities?division_id=<id>` seulement si des
localités existent réellement dans le schéma. Réponse :
`{items:[{id,parent_id,name,name_translations,active}]}`. Sinon, décider
officiellement que la localité est hors périmètre et aligner le contrat
d’inscription ; aucune migration ne doit être improvisée.

Critères d’acceptation : les deux communes sont chargées par libellé, la
localité enfant est chargée par libellé, `division_id` et `locality_id` restent
distincts, les identifiants invalides sont refusés, et aucun UUID n’est visible.
Solution minimale : contrat backend/documentation et validation d’un seul
parcours Cotonou/Abomey-Calavi avant l’UI.

### Décision 2 — OTP et comptes professionnels de démonstration

Décision recommandée : utiliser `POST /auth/otp/request` puis
`POST /auth/otp/verify` avec `purpose=REGISTER` ou `LOGIN`, `DeviceIdProvider`
et la session R-02A. Aucun OTP fixe ne doit être codé ou seedé.

État backend réel : `ConsoleSmsProvider` est le provider dev/test et journalise
le code ; les tests disposent de `TestSmsSpy`. Le store OTP est en mémoire.
`ProfileService` exige OTP vérifié, `consents.cgv=true`, catégorie et localité,
puis active le compte. Le seed DEMO_R02 actuel crée des comptes déjà `ACTIVE`
pour la recherche et ne constitue donc pas un flux REGISTER.

Écart : aucun compte DEMO_R03 dédié à l’OTP dynamique n’est encore prévu.
Les comptes devront utiliser des numéros entièrement synthétiques marqués
`DEMO_R03`, sans email, secret ni OTP fixe, et rester invisibles dans les
réponses publiques.

Décision/lot : **R-03A0**, puis **R-03A**. Prévoir séparément un seed local
idempotent/cleanup limité à `tchatcha_e2e`, créant seulement des comptes de
test contrôlés ; récupérer le code via `TestSmsSpy` en E2E ou le provider
console en local. Ne jamais lire Supabase.

Critères d’acceptation : REGISTER professionnel réel aboutit à `ACTIVE` avec
`PROFESSIONAL`, LOGIN d’un actif fonctionne, refresh/logout fonctionnent, un
actif ne repasse pas par REGISTER, et aucun OTP/numéro tiers n’est affiché.
Solution minimale : fixture de test et contrat de capture OTP, sans valeur
secrète persistée.

### Décision 3 — publication du profil

Décision recommandée : distinguer compte `ACTIVE`, profil complété, profil
visible et badge vérifié. Le minimum UX est catégorie, commune/localité, nom
professionnel/public, description et au moins un service. Les horaires sont
recommandés mais ne bloquent pas tant que le backend ne les impose pas.

État backend réel : aucune colonne/route `published` n’a été identifiée. La
fonction `search.is_professional_publishable` impose profil `ACTIVE`, utilisateur
`ACTIVE` non supprimé/non anonymisé et rôle `PROFESSIONAL`. La reconstruction
de recherche exige en pratique une localisation et un service actif ; la fiche
publique applique cette même fonction. `verified` est indépendant et n’est pas
requis pour être visible.

Écart : description, nom, horaires et service primaire ne sont pas des critères
serveur explicites de publication. Une fiche peut donc être publiable selon la
fonction SQL sans satisfaire la promesse produit de fiche non vide.

Décision/lot : **R-03A0** pour la règle, **R-03B** pour l’UI et éventuellement
`R-03B-backend-publication` si une garantie serveur est exigée. Sans migration,
la solution minimale est d’imposer les cinq champs dans l’UI et de reconstruire
la projection après chaque écriture. Si le serveur doit garantir cette règle,
ajouter un état/contrat explicite et ses tests avant exposition publique.

Critères d’acceptation : actif incomplet invisible, profil complet avec service
et localisation visible même non vérifié, badge seulement après décision réelle
(`verified=true`), suspension retirant recherche et fiche, et aucune PII dans la
projection publique. Les horaires restent modifiables sans effet implicite.

## 10. Première tâche d’implémentation proposée

Créer un test de contrat local pour `RegisterDto`/`ProfileService` avec un compte
professionnel synthétique et les catalogues déjà présents, puis implémenter le
routeur Flutter qui lit `/me.roles` et ouvre explicitement le shell
professionnel. Cette tâche doit rester sans secret, sans numéro réel et sans
modification de Supabase.
