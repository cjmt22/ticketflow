# Database Design (ERD)

```mermaid
erDiagram
    ORGANISATION ||--o{ USER : has
    ORGANISATION ||--o{ TICKET : owns
    ORGANISATION ||--o{ AUDIT_LOG : records
    USER ||--o{ TICKET : "requests"
    USER |o--o{ TICKET : "is assigned"
    USER ||--o{ COMMENT : writes
    USER ||--o{ AUDIT_LOG : performs
    TICKET ||--o{ COMMENT : has
    TICKET ||--o{ ATTACHMENT : has

    ORGANISATION {
        uuid id PK
        string name
        datetime created_at
    }
    USER {
        uuid id PK
        uuid organisation_id FK
        string email UK
        string password_hash
        string full_name
        string role "ADMIN, AGENT or CUSTOMER"
        boolean is_active
        datetime created_at
    }
    TICKET {
        uuid id PK
        uuid organisation_id FK
        uuid requester_id FK
        uuid assignee_id FK "nullable"
        string title
        text description
        string status "OPEN, IN_PROGRESS, RESOLVED, CLOSED"
        string priority "LOW, MEDIUM, HIGH, URGENT"
        string category
        string ai_category "nullable"
        string ai_priority "nullable"
        string ai_sentiment "nullable"
        text ai_summary "nullable"
        datetime created_at
        datetime updated_at
    }
    COMMENT {
        uuid id PK
        uuid ticket_id FK
        uuid author_id FK
        text body
        boolean is_internal
        datetime created_at
    }
    ATTACHMENT {
        uuid id PK
        uuid ticket_id FK
        string file_name
        string storage_key
        int size_bytes
        datetime created_at
    }
    AUDIT_LOG {
        uuid id PK
        uuid organisation_id FK
        uuid actor_id FK
        string action
        string entity_type
        uuid entity_id
        datetime created_at
    }
```

## Design notes
- **Multi-tenancy:** every tenant-owned table carries `organisation_id`, and every query filters by it.
- **IDs:** UUIDs, so IDs can't be guessed or counted.
- **AI fields:** stored separately from `category` and `priority`, so an Agent's override never destroys the original AI suggestion.
- **Internal notes:** `is_internal` hides a comment from Customers.