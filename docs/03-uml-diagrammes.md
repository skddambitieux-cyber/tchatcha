# Diagrammes UML (Mermaid)

Les diagrammes sont écrits en Mermaid : ils s'affichent directement sur GitHub,
GitLab ou VS Code (extension Mermaid).

---

## 1. Diagramme de composants (vue système)

```mermaid
graph TB
    subgraph Clients
        A1[App Client Flutter]
        A2[App Pro Flutter]
        A3[App Livreur Flutter]
        A4[Dashboard Admin Web]
        A5[Portail Web]
    end

    subgraph Backend[NestJS - Modular Monolith]
        G[API Gateway<br/>JWT + Guards + RateLimit]
        M1[auth] --- M2[users] --- M3[professionals] --- M4[categories]
        M5[geolocation] --- M6[search] --- M7[requests] --- M8[messaging]
        M9[notifications] --- M10[reviews] --- M11[admin] --- M12[payments P2]
        M1 --- G
        M2 --- G
        M3 --- G
        M4 --- G
        M5 --- G
        M6 --- G
        M7 --- G
        M8 --- G
        M9 --- G
        M10 --- G
        M11 --- G
        M12 --- G
    end

    subgraph Data
        P[(PostgreSQL 16<br/>+ PostGIS)]
        R[(Redis<br/>cache + OTP + files)]
        S[(S3 - Cloudflare R2<br/>médias)]
        F[Firebase<br/>Cloud Messaging]
        O[OpenStreetMap<br/>+ MapLibre]
    end

    A1 --> G
    A2 --> G
    A3 --> G
    A4 --> G
    A5 --> G

    M1 --> R
    M1 --> P
    M2 --> P
    M3 --> P
    M4 --> P
    M5 --> P
    M6 --> P
    M6 --> R
    M7 --> P
    M8 --> R
    M9 --> F
    M10 --> P
    M11 --> P
    M12 --> P
    M3 --> S
    M2 --> S
    M8 --> S
    M5 --> O
    M6 --> O
```

---

## 2. Diagramme de classes — structure d'un module (Clean Architecture)

```mermaid
classDiagram
    class Controller {
        +handle(request: DTO) Response
    }
    class UseCase {
        +execute(command) Result
    }
    class Entity {
        +id
        +rulesMetier()
    }
    class RepositoryInterface {
        <<interface>>
        +findById(id) Entity
        +save(entity)
    }
    class RepositoryPostgres {
        +findById(id) Entity
        +save(entity)
    }
    class DTO {
        +validation()
    }

    Controller --> DTO
    Controller --> UseCase
    UseCase --> Entity
    UseCase --> RepositoryInterface
    RepositoryPostgres ..|> RepositoryInterface
    RepositoryPostgres --> Entity
```

Règle : la flèche va toujours de l'extérieur vers l'intérieur (le domaine est au centre).

---

## 3. Diagramme de séquence — Mode B (publication d'un besoin)

```mermaid
sequenceDiagram
    actor C as Client (App)
    participant G as API Gateway
    participant RQ as Module Requests
    participant US as Module Users
    participant NT as Module Notifications
    actor P as Professionnels (App Pro)

    C->>G: POST /api/v1/requests {description, photos, budget, date, adresse, urgence}
    G->>RQ: valide + authentifie
    RQ->>RQ: crée la demande (statut OPEN)
    RQ->>US: recherche pros éligibles (catégorie + géoloc)
    US-->>RQ: liste pros
    RQ->>NT: notifie les pros (FCM push)
    NT-->>P: 🔔 nouvelle demande
    P->>G: POST /api/v1/requests/:id/quotes {prix, message}
    G->>RQ: ajoute une proposition
    RQ->>NT: notifie le client
    NT-->>C: 🔔 nouvelle proposition
    C->>G: POST /api/v1/requests/:id/select {professionalId}
    G->>RQ: statut SELECTED + crée la conversation
    RQ->>NT: notifie le pro sélectionné
    RQ->>NT: notifie les autres (refus)
```

---

## 4. Diagramme de séquence — Flux d'authentification (OTP)

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant G as API Gateway
    participant A as Module Auth
    participant R as Redis
    participant S as SMS Provider
    participant DB as PostgreSQL

    U->>G: POST /api/v1/auth/register {téléphone, nom, rôle}
    G->>A: validation
    A->>DB: vérifie téléphone unique
    A->>R: génère OTP (6 chiffres, 5 min, 3 essais max)
    A->>S: envoie SMS
    S-->>U: code reçu
    U->>G: POST /api/v1/auth/verify-otp {téléphone, code}
    G->>A: vérifie OTP dans Redis
    A->>DB: crée le compte (statut ACTIVE)
    A->>A: génère access token (15 min) + refresh (30 j)
    A->>R: enregistre refresh token
    A-->>U: {accessToken, refreshToken, user}
```

---

## 5. Diagramme de séquence — Recherche avec géolocalisation

```mermaid
sequenceDiagram
    actor U as Client
    participant G as API Gateway
    participant S as Module Search
    participant P as PostgreSQL (PostGIS)
    participant R as Redis

    U->>G: GET /api/v1/search?q=carreleur&lat=6.37&lon=2.43&d=5&sort=note
    G->>S: authentifie + valide
    S->>R: vérifie cache (clé = params)
    alt Cache hit
        R-->>S: résultats en cache
    else Cache miss
        S->>P: ST_DWithin(geom, point, 5km) + full-text + tri
        P-->>S: pros (id, note, tarif, distance)
        S->>R: met en cache (TTL 5 min)
    end
    S-->>U: liste ordonnée + distance + disponibilité
```

---

## 6. Diagramme de déploiement (MVP)

```mermaid
graph TB
    subgraph CDN[Cloudflare - CDN]
        FE[Fichiers statiques + tuiles]
    end

    subgraph VM1[Serveur 1 - Backend]
        API[NestJS - app]
        NGINX[NGINX - reverse proxy TLS]
    end

    subgraph VM2[Serveur 2 - Data]
        PG[(PostgreSQL 16 + PostGIS)]
        RD[(Redis)]
    end

    subgraph VM3[S3]
        R2[(Cloudflare R2 - médias)]
    end

    subgraph Ext[Services externes]
        FCM[Firebase Cloud Messaging]
        SMS[SMS Provider]
        OSM[OpenStreetMap - Nominatim]
    end

    AppMobile[App Flutter] --> CDN
    AppMobile --> NGINX
    NGINX --> API
    API --> PG
    API --> RD
    API --> R2
    API --> FCM
    API --> SMS
    API --> OSM
    R2 --> CDN
```

---

## 7. Diagramme de classes — Domaines clés (aperçu, détaillé à l'Étape 2)

```mermaid
classDiagram
    class User {
        +id
        +phone
        +role
        +name
        +avatarUrl
        +verified
    }
    class Professional {
        +id
        +userId
        +categoryId
        +bio
        +experienceYears
        +minPrice
        +availability
        +rating
        +badgeVerified
        +lat
        +lon
    }
    class Category {
        +id
        +parentId
        +name
        +icon
    }
    class ServiceRequest {
        +id
        +clientId
        +categoryId
        +description
        +budget
        +desiredDate
        +urgency
        +status
        +lat
        +lon
    }
    class Quote {
        +id
        +requestId
        +professionalId
        +price
        +message
        +status
    }
    class Review {
        +id
        +requestId
        +rating
        +punctuality
        +quality
        +priceRatio
        +politeness
        +comment
    }
    class Conversation {
        +id
        +clientId
        +professionalId
    }
    class Message {
        +id
        +conversationId
        +senderId
        +type
        +content
        +createdAt
    }

    User "1" --> "0..1" Professional : a
    Category "1" --> "0..*" Professional : contient
    Category --> Category : sous-catégories
    User "1" --> "0..*" ServiceRequest : publie
    ServiceRequest "1" --> "0..*" Quote : reçoit
    Quote "1" --> "0..1" Review : donne lieu à
    User "1" --> "0..*" Conversation
    Conversation "1" --> "0..*" Message
```
