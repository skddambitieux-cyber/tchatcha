# TCHATCHA mobile — R-01

Cette application Android couvre le périmètre R-01 : connexion des comptes
existants et inscription CLIENT par OTP. Les tokens restent gérés par le
flux d’authentification et ne sont jamais affichés dans l’interface.

## API locale

L’URL est configurable sans modifier le code :

```sh
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

La valeur par défaut est réservée au développement local sur émulateur.
Pour un téléphone Android réel connecté au même poste :

```sh
adb reverse tcp:3000 tcp:3000
flutter run --dart-define=API_URL=http://127.0.0.1:3000/api/v1
```

## Périmètre

Le REGISTER mobile crée uniquement des comptes CLIENT. L’onboarding
PROFESSIONAL, avec sélections de catégorie et de localité chargées depuis
l’API, est reporté à un lot dédié ; aucun identifiant technique n’est demandé
à l’utilisateur dans R-01.

Aucune donnée personnelle réelle, clé, secret, OTP ou token ne doit être
ajouté au dépôt ou affiché dans l’application.

## R-02A — socle Client

R-02A ajoute la restauration de session, le stockage Android sécurisé via
Keystore, le rafraîchissement rotatif single-flight et un accueil Client
alimenté par `/me`, `/geo/countries`, les divisions de `BJ` et `/categories`.
Les communes et catégories viennent de l’API : aucun UUID n’est affiché ou
saisi. La recherche, les fiches professionnelles et les demandes sont
reportées à R-02B/R-02C.

Les tokens sont conservés uniquement par `flutter_secure_storage`, jamais dans
les logs, erreurs ou préférences en clair. Les tests utilisent
`MemorySessionStore` et des doubles HTTP ; ils ne dépendent ni d’un téléphone,
ni de Supabase.

Dépendances ajoutées : `http` pour le transport injectable,
`flutter_secure_storage` pour Android Keystore et `uuid` pour les clés
d’idempotence futures. Les versions sont verrouillées dans `pubspec.lock`.

## R-02B — recherche et fiche publique

R-02B ajoute la recherche publique paginée par texte, métier et commune, puis
la fiche publique d’un professionnel. Les filtres utilisent `/search` et les
fiches `/professionals/:id`. Les réponses sont limitées aux projections
publiques du backend : aucun contact, UUID ou identifiant interne n’est affiché.
La création d’une demande reste réservée à R-02C.
