# Amrutam Telemedicine Backend Architecture Document

**Version:** 1.0.0  
**Target Scale:** 100,000 Consultations / Day  
**Latency Targets:** p95 Reads < 200ms | p95 Writes < 500ms  
**Target Availability:** 99.95% (Three-and-a-half Nines)  
**Compliance Standards:** HIPAA, DISHA (India), OWASP Top 10  

---

## 1. System Overview & Scale Estimation

Amrutam’s telemedicine platform provides remote Ayurvedic and modern clinical consultations, connecting verified doctors with patients nationwide.

### 1.1 Scale Calculations (100,000 Daily Consultations)

| Metric | Calculation | Value |
| :--- | :--- | :--- |
| **Daily Consultations** | Base requirement | 100,000 sessions/day |
| **Peak Operating Window** | Consultations concentrated in a 14-hour window (8 AM – 10 PM) | 50,400 seconds |
| **Average Write Throughput** | $100,000 / 50,400\text{ s}$ | ~2.0 writes/sec |
| **Peak Write Throughput** | $6\times\text{ surge factor}$ | ~12–15 writes/sec |
| **Read-to-Write Ratio** | Browsing doctors, searching slots, viewing medical history (~10:1) | 10:1 ratio |
| **Peak Read Throughput** | $15\text{ writes/sec} \times 10$ | ~150–200 QPS |
| **Monthly Database Growth** | 100k consultations $\times$ 30 days = 3,000,000 records/month | ~3.0M rows/month |
| **Audit Log Volume** | ~5 audit events per consultation cycle | ~15,000,000 events/month |
| **Storage Growth** | ~$3\text{ KB/consultation} + 1\text{ KB/audit}$ | ~24 GB/month raw data |

### 1.2 Latency Budget (p95 Targets)

```
[Client App] 
     │ (Network: ~40ms)
     ▼
[CloudFront / ALB]
     │ (TLS Termination & Rate Limiting: ~10ms)
     ▼
[API Pod (K8s)]
     │ (Auth, RBAC, Validation: ~10ms)
     │ (L1 Cache / Redis L2 Cache Check: ~5ms)
     ▼
[PostgreSQL Database / Distributed Lock]
     │ (Optimistic Slot Check + Index Seek: ~15ms)
     │ (AES-256 GCM PHI Decryption: ~5ms)
     ▼
[Response Pipeline]
     │ (Serialization & Output: ~5ms)
     ▼
Total Read p95 Budget: ~85ms (Well within < 200ms SLA)
Total Write p95 Budget: ~220ms (Well within < 500ms SLA)
```

---

## 2. High-Level Architecture & Data Flow

```mermaid
graph TD
    Client["Client Devices (Mobile / Web App)"]
    CDN["CloudFront / Edge Ingress (WAF + TLS 1.3)"]
    ALB["AWS Application Load Balancer / NGINX Ingress"]
    
    subgraph "Kubernetes Cluster (EKS / Multi-AZ)"
        API1["API Pod 1 (Node.js 22 + TypeScript)"]
        API2["API Pod 2 (Node.js 22 + TypeScript)"]
        APIn["API Pod N (HPA 3 - 30 Replicas)"]
        Worker["Async Background Queue Worker"]
    end

    subgraph "Caching & Concurrency Layer"
        Redis["ElastiCache Redis Multi-AZ Cluster<br/>(Distributed Locks & Session Cache)"]
    end

    subgraph "Persistence Layer (PostgreSQL 16 Multi-AZ)"
        PG_Primary["Aurora PostgreSQL Primary (Writer)"]
        PG_Replica1["Aurora Read Replica 1 (AZ-b)"]
        PG_Replica2["Aurora Read Replica 2 (AZ-c)"]
    end

    subgraph "Security & KMS"
        KMS["AWS KMS Envelope Encryption<br/>(AES-256-GCM Master Keys)"]
    end

    subgraph "Observability Platform"
        Prometheus["Prometheus Metric Collector"]
        Grafana["Grafana Dashboards"]
        Jaeger["Jaeger Tracing (W3C Spans)"]
    end

    Client -->|HTTPS / W3C Traceparent| CDN
    CDN --> ALB
    ALB --> API1 & API2 & APIn
    
    API1 & API2 & APIn -->|Acquire / Release Lock| Redis
    API1 & API2 & APIn -->|Mutating Writes & Transactions| PG_Primary
    API1 & API2 & APIn -->|Read Queries & Doctor Search| PG_Replica1 & PG_Replica2
    API1 & API2 & APIn -->|Encrypt / Decrypt PHI| KMS
    API1 & API2 & APIn -->|Enqueue Notifications| Worker

    API1 & API2 & APIn -->|Expose /metrics| Prometheus
    Prometheus --> Grafana
    API1 & API2 & APIn -->|Emit Spans| Jaeger
```

---

## 3. Booking Flow Sequence Diagram (Saga Orchestration)

To prevent double booking under extreme concurrent demand and ensure financial consistency, Amrutam uses an **Orchestration-based Saga** with automated compensation.

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant API as API Gateway / App
    participant Lock as Redis Distributed Lock
    participant DB as PostgreSQL Database
    participant PaymentGW as Payment Gateway
    participant Queue as Async Notification Queue

    Patient->>API: POST /api/v1/bookings (Idempotency-Key: IDEM-123)
    Note over API: Step 1: Idempotency Check
    API->>DB: Check idempotency_keys table
    alt Key Already Processed
        API-->>Patient: 200 OK (Cached Response from X-Cache)
    end

    Note over API: Step 2: Acquire Distributed Lock
    API->>Lock: ACQUIRE lock:slot:{slotId} (TTL 10s)
    alt Lock Contention (Resource Busy)
        Lock-->>API: Conflict (null)
        API-->>Patient: 409 Conflict (Slot locked by concurrent booking)
    end
    Lock-->>API: Lock Token Acquired

    Note over API: Step 3: Optimistic Concurrency Slot Hold
    API->>DB: UPDATE availability_slots SET status='HELD', version=version+1 WHERE id={slotId} AND version={v}
    alt Version Mismatch (Already Held or Booked)
        API->>Lock: RELEASE lock:slot:{slotId}
        API-->>Patient: 409 Conflict (Slot already booked)
    end

    Note over API: Step 4: Create Consultation Record
    API->>DB: INSERT INTO consultations (status='REQUESTED')

    Note over API: Step 5: Process Payment with Backoff & Jitter
    API->>PaymentGW: Charge Consultation Fee (Idempotency-Key)
    alt Payment Succeeded
        PaymentGW-->>API: Transaction Success (TXN_ID)
        API->>DB: UPDATE availability_slots SET status='BOOKED'
        API->>DB: UPDATE consultations SET status='CONFIRMED', room_url=...
        API->>DB: INSERT INTO payments (status='SUCCESS')
        API->>DB: INSERT INTO audit_logs (CONSULTATION_BOOK, Hash Chain)
        API->>Queue: Enqueue SEND_CONSULTATION_CONFIRMATION
        API->>Lock: RELEASE lock:slot:{slotId}
        API-->>Patient: 201 Created (Confirmed Consultation & Room URL)
    else Payment Failed / Gateway Timeout
        Note over API: SAGA COMPENSATION STEP
        PaymentGW-->>API: Payment Declined / Timeout
        API->>DB: UPDATE availability_slots SET status='AVAILABLE', held_by_user_id=null
        API->>DB: UPDATE consultations SET status='CANCELLED', reason='Payment failure'
        API->>DB: INSERT INTO audit_logs (SLOT_RELEASE, PAYMENT_FAILED)
        API->>Lock: RELEASE lock:slot:{slotId}
        API-->>Patient: 409 Conflict / 402 Payment Required (Compensation executed)
    end
```

---

## 4. Entity Relationship (ER) Diagram

```mermaid
erDiagram
    USERS ||--|| PROFILES : has
    USERS ||--o| DOCTORS : "acts as"
    DOCTORS ||--o{ AVAILABILITY_SLOTS : defines
    USERS ||--o{ CONSULTATIONS : "requests (Patient)"
    DOCTORS ||--o{ CONSULTATIONS : "conducts (Doctor)"
    AVAILABILITY_SLOTS ||--o| CONSULTATIONS : reserves
    CONSULTATIONS ||--o| PRESCRIPTIONS : generates
    CONSULTATIONS ||--o| PAYMENTS : charges
    USERS ||--o{ AUDIT_LOGS : triggers

    USERS {
        uuid id PK
        varchar email UK
        varchar password_hash
        user_role role
        boolean is_active
        boolean mfa_enabled
        varchar mfa_secret
        timestamp last_login_at
        timestamp created_at
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        varchar first_name
        varchar last_name
        varchar phone_number
        date date_of_birth
        varchar gender
        varchar blood_group
        varchar address_city
    }

    DOCTORS {
        uuid id PK
        uuid user_id FK
        varchar registration_number UK
        varchar specialization
        varchar sub_specialization
        int experience_years
        numeric consultation_fee
        text_array languages
        numeric rating_avg
        int rating_count
        boolean is_verified
    }

    AVAILABILITY_SLOTS {
        uuid id PK
        uuid doctor_id FK
        timestamp start_time
        timestamp end_time
        slot_status status
        uuid held_by_user_id FK
        timestamp hold_expires_at
        int version
    }

    CONSULTATIONS {
        uuid id PK
        varchar reference_no UK
        uuid patient_id FK
        uuid doctor_id FK
        uuid slot_id FK
        consultation_status status
        text symptoms
        text clinical_notes_encrypted
        text diagnosis_encrypted
        varchar room_url
        timestamp started_at
        timestamp completed_at
        timestamp created_at PK
    }

    PRESCRIPTIONS {
        uuid id PK
        uuid consultation_id FK
        uuid doctor_id FK
        uuid patient_id FK
        text medications_encrypted
        text instructions_encrypted
        varchar digital_signature
        varchar key_version
        timestamp issued_at
    }

    PAYMENTS {
        uuid id PK
        varchar idempotency_key UK
        uuid consultation_id FK
        uuid patient_id FK
        numeric amount
        varchar currency
        payment_status status
        varchar provider_transaction_id
    }

    AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        varchar actor_role
        varchar action
        varchar resource
        varchar resource_id
        varchar ip_address
        jsonb details
        varchar previous_hash
        varchar block_hash
        timestamp created_at PK
    }
```

---

## 5. Retry & Exponential Backoff with Full Jitter

Transient network failures during third-party payment gateway or webhook calls are managed using **Exponential Backoff with Full Jitter** (proven to prevent thundering herd problems):

$$\text{Sleep Delay} = \text{random}(0, \min(M, B \times 2^{\text{attempt}}))$$

- **Base Delay ($B$):** 1,000 ms
- **Max Delay ($M$):** 30,000 ms
- **Full Jitter:** Randomizes delay across the entire range to distribute retry traffic across different backend threads.

---

## 6. Data Partitioning Strategy

With 100,000 consultations daily:
- **Consultations Table:** Partitioned by **RANGE (created_at)** on monthly boundaries.
- **Audit Logs Table:** Partitioned by **RANGE (created_at)** on monthly boundaries.
- **Benefits:**
  1. Queries for active month hit only the active partition index (~3M rows instead of 50M+ rows).
  2. Cold data older than regulatory retention requirements (7 years) can be detached and archived to Amazon S3 Parquet format via AWS Athena.
  3. VACUUM and ANALYZE operations run per partition without locking the entire table.

---

## 7. Caching & Concurrency Handling

1. **Two-Tier Caching:**
   - **Tier 1 (In-Memory / L1):** Frequently accessed static metadata (specializations, symptom lists).
   - **Tier 2 (Redis Cluster / L2):** Doctor search results, active availability slots, and idempotency cache records with 24-hour TTL.
2. **Double-Booking Guard (Two-Phase Concurrency Control):**
   - **Phase 1 (Mutual Exclusion):** Redis distributed lock on `lock:slot:{slotId}` prevents parallel execution threads from inspecting the same slot concurrently.
   - **Phase 2 (Optimistic Concurrency Control):** PostgreSQL atomic SQL update checking `version = expected_version` and incrementing `version = version + 1`.

---

## 8. Backup & Disaster Recovery (DR) Strategy

- **Recovery Point Objective (RPO):** $< 5\text{ minutes}$
- **Recovery Time Objective (RTO):** $< 30\text{ minutes}$
- **Backup Architecture:**
  - Continuous Write-Ahead Log (WAL) archiving to encrypted Amazon S3 buckets using WAL-G.
  - Multi-AZ Aurora Storage with automatic 6-way replication across 3 Availability Zones.
  - Cross-region asynchronous replication to secondary region (`ap-south-2` Hyderabad).
  - Automated weekly DR failover drills verifying point-in-time recovery to within 5 minutes of simulated outage.
