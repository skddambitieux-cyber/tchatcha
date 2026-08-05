Parfait. Je vois le problème.

Ce fichier .env.example est prévu pour un développement avec Docker en local (PostgreSQL, Redis, MinIO sur localhost).

Comme tu utilises Supabase, il faut modifier uniquement la partie Base de données. Le reste peut rester tel quel pour le moment.

Remplace :

# --- Base de données (PostgreSQL 16 + PostGIS, docker-compose) ---
DATABASE_URL=postgres://tchatcha:tchatcha_dev_password@localhost:5432/tchatcha
DB_SSL=disabled

par :

# --- Base de données (Supabase PostgreSQL) ---
DATABASE_URL=postgresql://postgres.xxxxx:TON_MOT_DE_PASSE@db.xxxxxxxxx.supabase.co:5432/postgres
DB_SSL=require

ou, si tu dois utiliser le Session Pooler :

DATABASE_URL=postgresql://postgres.xxxxx:TON_MOT_DE_PASSE@aws-0-xxxx.pooler.supabase.com:5432/postgres
DB_SSL=require
Les autres variables

Tu peux les laisser comme elles sont pour l'instant :

REDIS_URL=redis://localhost:6379 (tu n'utiliseras Redis que lorsque tu installeras Redis ou un service équivalent)
S3_* (tu remplaceras plus tard MinIO par un stockage adapté si besoin)
JWT_SECRET et JWT_REFRESH_SECRET : génère de vraies valeurs aléatoires avant de lancer l'application.
SMS_PROVIDER, FCM_SERVICE_ACCOUNT_PATH, OTEL_ENDPOINT peuvent rester à xxxx tant que ces fonctionnalités ne sont pas développées.
Ce qu'il faut faire maintenant
Crée un fichier .env à partir de .env.example.
Remplace uniquement DATABASE_URL et DB_SSL comme indiqué.
Laisse le reste inchangé.
Ensuite, on vérifiera que apps/api/src/database/datasource.ts utilise bien :
url: process.env.DATABASE_URL,

Avant de modifier quoi que ce soit d'autre, montre-moi le contenu de apps/api/src/database/datasource.ts. C'est ce fichier qui dira si la connexion à Supabase est correctement configurée.