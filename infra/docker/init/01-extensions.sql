-- TCHATCHA — Extensions PostgreSQL chargées au boot du container (06-schema-base.md)
CREATE EXTENSION IF NOT EXISTS postgis;      -- géolocalisation (GIST, rayon)
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- recherche floue / trigrammes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid v4 / v7
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- fonctions hash/API