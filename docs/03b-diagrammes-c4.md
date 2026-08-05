# Diagrammes C4 — Plateforme de Services de Proximité

Version : 1.1 — ajout demandé par la revue d'architecture (point 15)

Niveaux fournis : Context, Container, Component (exemple). S'y ajoutent :
architecture logique, architecture physique, flux principaux.

---

## Niveau 1 — C4 Context (le système et son environnement)

```mermaid
flowchart LR
    U[Utilisateur<br/>Particulier] -->|recherche, commande, besoin| S
    P[Professionnel<br/>indépendant / entreprise] -->|vitrine, devis, RDV| S
    D[Livreur] -->|courses| S
    A[Administrateur] -->|gestion, validation| S
    E[Partenaire<br/>restaurant, banque] -->|intégration| S

    S[Plateforme de Services<br/>de Proximité]
    S -->|SMS OTP| SMS[SMS Provider]
    S -->|push| FCM[Firebase Cloud Messaging]
    S -->|paiements| PAY[MTN MoMo / Moov / Cartes]
    S -->|tuiles + géocoding| OSM[OpenStreetMap]
    S -->|médias| R2[Cloudflare R2 + CDN]
```

---

## Niveau 2 — C4 Container (technologies et frontières)

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        CA["App Client<br/>(Flutter)"]
        CP["App Pro<br/>(Flutter)"]
        CD["App Livreur<br/>(Flutter)"]
        CW["Web Admin / Portail<br/>(Vue ou Flutter Web)"]
    end

    CA -->|HTTPS REST /api/v1| GW
    CP -->|HTTPS REST /api/v1| GW
    CD -->|HTTPS REST /api/v1| GW
    CW -->|HTTPS REST /api/v1| GW

    subgraph Backend["Backend — NestJS monorepo (modular monolith)"]
        GW["API Gateway<br/>JWT · Guards · Rate limiting · Validation · Swagger"]
        M1["Module Auth"]
        M2["Module Users & Pros"]
        M3["Module Categories & Geography"]
        M4["Module Search & Geoloc"]
        M5["Module Requests & Quotes<br/>(marketplace)"]
        M6["Module Messaging"]
        M7["Module Notifications"]
        M8["Module Reviews"]
        M9["Module Admin"]
        M10["Module Payments (P2)"]
        M11["Module AI (ports vides)"]
        OB["Outbox + Event Bus<br/>(Redis Streams)"]
        M1 --> OB
        M2 --> OB
        M5 --> OB
        M8 --> OB
    end

    GW --> M1
    GW --> M2
    GW --> M3
    GW --> M4
    GW --> M5
    GW --> M6
    GW --> M7
    GW --> M8
    GW --> M9
    GW --> M10
    GW --> M11

    M7 -->|NotificationProviderPort| FCM2["Adapters FCM / SMS / WhatsApp / Email"]
    M10 -->|PaymentGatewayPort| PAY2["Adapters MoMo / Moov / Cartes / Stripe"]

    subgraph Data["Données"]
        PG[("PostgreSQL 16 + PostGIS<br/>schémas par module")]
        RD[("Redis<br/>cache · OTP · files · présence")]
        S3[("S3 compatible<br/>Cloudflare R2 / MinIO")]
    end

    M1 --> RD
    M1 --> PG
    M2 --> PG
    M3 --> PG
    M4 --> PG
    M4 --> RD
    M5 --> PG
    M6 --> RD
    M8 --> PG
    M9 --> PG
    M2 --> S3
    M6 --> S3

    OB -->|relecture| M7
    OB -->|indexation| M4
```

---

## Niveau 3 — C4 Component (exemple : module Requests)

```mermaid
flowchart TB
    subgraph API["Contrat API /api/v1/requests"]
        CTRL["RequestsController<br/>POST /, POST /:id/quotes, POST /:id/select"]
    end

    subgraph App["Couche Application (use-cases)"]
        UC1["CreateRequestUseCase"]
        UC2["RespondWithQuoteUseCase"]
        UC3["NegotiateUseCase"]
        UC4["SelectQuoteUseCase"]
        UC5["CompleteRequestUseCase"]
    end

    subgraph Dom["Couche Domaine (pur)"]
        ENT["ServiceRequest (agrégat)<br/>+ statuts machine à états"]
        VOS["Value Objects :<br/>Budget · GeoPoint · Status"]
        PORTS["Ports :<br/>RequestRepositoryPort<br/>QuoteRepositoryPort<br/>NotificationPort<br/>PaymentPort (P2)"]
    end

    subgraph Infra["Couche Infrastructure"]
        REPO["TypeORM Repositories<br/>(schéma requests)"]
        EVT["DomainEventPublisher<br/>(Outbox → Redis)"]
    end

    CTRL --> UC1
    CTRL --> UC2
    CTRL --> UC3
    CTRL --> UC4
    CTRL --> UC5

    UC1 --> ENT
    UC2 --> ENT
    UC3 --> ENT
    UC4 --> ENT
    UC5 --> ENT

    UC1 --> PORTS
    UC2 --> PORTS
    UC3 --> PORTS
    UC4 --> PORTS
    UC5 --> PORTS

    PORTS --> REPO
    PORTS --> EVT
    EVT -->|événements request.*| OB[("Redis Streams<br/>Outbox")]

    REPO --> PG[("PostgreSQL<br/>schema requests")]
```

---

## Architecture logique (couches, ports, dépendances)

```mermaid
flowchart LR
    subgraph Externes["Contrats externes"]
        PAY["PaymentGatewayPort"]
        NOT["NotificationProviderPort"]
        STO["StoragePort"]
        MAP["MapPort"]
        SEA["SearchPort"]
        SMS["SmsPort"]
        LOG["LoggingPort"]
        AI["Ports IA (vides)"]
    end

    subgraph Domaine["Domaine métier (cœur, aucune dépendance)"]
        MOD1["auth"] --- MOD2["users"]
        MOD2 --- MOD3["professionals"]
        MOD3 --- MOD4["categories + geography"]
        MOD4 --- MOD5["search"]
        MOD5 --- MOD6["requests/quotes"]
        MOD6 --- MOD7["messaging"]
        MOD6 --- MOD8["reviews"]
        MOD6 --- MOD9["notifications"]
        MOD6 --- MOD10["payments"]
        MOD6 --- MOD11["ai"]
    end

    subgraph Infra["Infrastructure (adapters)"]
        AD1["Adapter TypeORM/PostgreSQL"]
        AD2["Adapter Redis"]
        AD3["Adapter S3 (R2)"]
        AD4["Adapter FCM/SMS/WhatsApp"]
        AD5["Adapter OSM/Google"]
        AD6["Adapter MoMo/Moov/Stripe"]
        AD7["Adapter PG search / ES"]
    end

    Domaine --> Externes
    Infra --> Domaine
    Infra --> Externes
```

Lecture : le domaine **déclare** les ports ; l'infrastructure **les implémente**.
La flèche de dépendance va toujours vers le domaine, jamais l'inverse.

---

## Architecture physique (déploiement)

```mermaid
flowchart TB
    subgraph Cloudflare["Cloudflare"]
        CDN["CDN — statiques, médias, tuiles"]
        WAF["WAF — anti-bot, TLS"]
    end

    subgraph VPS1["Serveur 1 — Backend (Docker)"]
        NGINX["NGINX — TLS, proxy"]
        API1["NestJS — API (replicas ×2)"]
        W1["Workers — jobs, notifications"]
        API1 --> W1
    end

    subgraph VPS2["Serveur 2 — Données"]
        PG[("PostgreSQL 16 + PostGIS<br/>+ réplicas lecture (P2)")]
        RD[("Redis — cache, files, OTP")]
    end

    subgraph VPS3["Serveur 3 — Stockage"]
        R2[("Cloudflare R2 (S3)")]
        MINIO[("MinIO — environnement de test")]
    end

    subgraph Ext["Services externes"]
        FCM["Firebase Cloud Messaging"]
        SMSX["SMS Provider"]
        OSMX["OpenStreetMap / Nominatim"]
        PAYX["API MTN MoMo · Moov · Cartes"]
    end

    Apps["Apps Flutter + Web"] -->|HTTPS| WAF
    WAF --> CDN
    WAF --> NGINX
    NGINX --> API1
    API1 --> PG
    API1 --> RD
    API1 --> R2
    API1 --> FCM
    API1 --> SMSX
    API1 --> OSMX
    API1 --> PAYX
    W1 --> FCM
    W1 --> SMSX
    W1 --> PG
    W1 --> RD
```

---

## Flux principaux

### Flux 1 — Parcours client complet (marketplace)

```mermaid
sequenceDiagram
    actor C as Client
    participant API as API Gateway
    participant RQ as Requests
    actor P as Professionnel
    participant PA as Payments
    participant RV as Reviews

    C->>API: POST /requests (besoin)
    API->>RQ: crée + publie
    RQ-->>P: notification (FCM)
    P->>API: POST /requests/:id/quotes (devis)
    RQ-->>C: notification
    C->>API: négociation (chat + contre-offre)
    C->>API: POST /requests/:id/select
    RQ->>API: réservation créée
    C->>API: POST /bookings/:id/pay
    API->>PA: PaymentGatewayPort.initiate
    PA-->>C: lien/confirmation mobile money
    PA->>API: webhook payment.succeeded
    RQ->>RQ: statut PAID → COMPLETED (prestation)
    C->>API: POST /requests/:id/reviews
    API->>RV: avis multi-critères + photos
    RV->>API: note moyenne mise à jour (pro)
```

### Flux 2 — Cycle de vie d'une demande (machine à états)

```mermaid
stateDiagram-v2
    [*] --> OPEN : publication besoin
    OPEN --> QUOTED : ≥ 1 devis reçu
    QUOTED --> NEGOTIATING : contre-offre
    NEGOTIATING --> QUOTED : nouvelle offre
    QUOTED --> SELECTED : client choisit
    NEGOTIATING --> SELECTED : client choisit
    SELECTED --> PAID : paiement
    PAID --> COMPLETED : prestation terminée
    COMPLETED --> REVIEWED : avis posté
    OPEN --> CANCELLED : expiration / client annule
    QUOTED --> CANCELLED
    NEGOTIATING --> CANCELLED
    SELECTED --> CANCELLED : annulation (règles)
    PAID --> REFUNDED : remboursement
```

### Flux 3 — Notifications multi-canaux

```mermaid
sequenceDiagram
    participant M as Module métier
    participant OB as Outbox
    participant N as Module notifications
    participant T as Templates i18n
    participant PRE as Préférences utilisateur
    participant NP as NotificationProviderPort
    participant F as Adapters (FCM/SMS/WhatsApp/Email)

    M->>OB: émet request.new_quote
    OB->>N: consomme événement
    N->>PRE: canaux + langue du destinataire
    N->>T: compose le message traduit
    N->>NP: send(channel, payload)
    NP->>F: dispatche
    alt Échec du canal principal
        F-->>NP: erreur
        NP->>F: repli (canal secondaire ou file Redis)
    end
```

### Flux 4 — Géolocalisation et recherche

```mermaid
sequenceDiagram
    actor C as Client
    participant API as API Gateway
    participant S as Search (SearchPort)
    participant P as PostgreSQL PostGIS
    participant R as Redis cache

    C->>API: GET /search?q=carreleur&lat&lon&d=5&sort=note
    API->>S: query normalisée + pays (X-Country)
    S->>R: cache lookup (clé = params+pays)
    alt miss
        S->>P: ST_DWithin + full-text + tri
        P-->>S: résultats + distances
        S->>R: TTL court
    end
    S-->>C: résultats paginés + métadonnées
```
