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
