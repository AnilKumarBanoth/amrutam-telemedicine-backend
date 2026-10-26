# Amrutam Telemedicine Backend: 5-Minute Demo Video Script

**Target Duration:** Exactly 5:00 minutes  
**Format:** Screen recording with voiceover  
**Presenter:** Backend Architect / Lead Engineer  

---

## Video Timeline & Script Breakdown

### [0:00 - 0:45] Intro & Architectural Overview (45s)
- **Visual:** Show `docs/ARCHITECTURE.md` architecture diagram and repository layout.
- **Voiceover:**
  > *"Hello! Today we are presenting the production-grade backend for Amrutam’s Telemedicine Platform. Our system is architected for 100,000 daily consultations with strict p95 latency targets: under 200 milliseconds for reads and under 500 milliseconds for writes, with 99.95% target availability.
  > Built with Node.js 22, TypeScript, PostgreSQL, and Redis, the system strictly implements Clean Architecture with Dependency Injection, AES-256-GCM Protected Health Information encryption, and an orchestration-based Saga to guarantee zero double bookings under heavy concurrent traffic."*

---

### [0:45 - 1:45] Automated Test Suite & Code Quality (60s)
- **Visual:** Terminal running `npm test`. Show 34 passing tests across unit and integration suites.
- **Voiceover:**
  > *"Let's begin by running our automated test suite with `npm test`. 
  > Notice that 100% of our 34 test cases pass across 5 test suites.
  > This includes unit testing for our AES-256-GCM authenticated cipher with authentication tag validation, distributed lock lease management, exponential backoff with full jitter, and cryptographic block hash chaining.
  > In the integration suite, we test the full end-to-end API lifecycle, verifying our W3C distributed tracing headers, role-based access control, and our booking saga."*

---

### [1:45 - 3:00] Live Concurrency Stress Test & Booking Saga (75s)
- **Visual:** Terminal executing `npm run demo`. Highlight Step 4 (Concurrency Stress Test) and Step 5 (Idempotency).
- **Voiceover:**
  > *"Now let's run our interactive live demonstration with `npm run demo`.
  > Watch closely at Step 4: we simulate a real-world flash sale scenario where 5 concurrent patient requests race to book the exact same appointment slot simultaneously.
  > Thanks to our two-phase concurrency control—pairing Redis distributed locks with PostgreSQL optimistic version increment checks—exactly ONE booking succeeds with 201 Created, while the other 4 concurrent transactions are cleanly rejected with 409 Conflict. There is absolutely zero double booking.
  > In Step 5, we demonstrate our `Idempotency-Key` middleware. When a patient app replays a write request with the same key, the server intercepts it and returns the cached response with `X-Cache: HIT-IDEMPOTENCY`, completely preventing double payments."*

---

### [3:00 - 4:00] Healthcare Security: AES-256 PHI & Tamper-Evident Hash Chains (60s)
- **Visual:** Highlight Step 6 (Consultation & Encryption), Step 7 (Prescription signing), and Step 8 (Audit verification).
- **Voiceover:**
  > *"In telemedicine, data privacy is paramount. In Step 6, when the doctor records clinical notes and diagnosis, they are encrypted at rest using AES-256-GCM with unique initialization vectors and authentication tags. Only authorized patients and assigned doctors can decrypt them; unauthorized actors see only encrypted ciphertext.
  > In Step 7, digital prescriptions are digitally signed using HMAC-SHA256, creating a tamper-evident digital seal.
  > And in Step 8, our regulatory audit trail implements blockchain-style parent block hash chaining using SHA-256. If any record in PostgreSQL is altered or deleted by a rogue actor, our automated integrity verifier immediately detects the cryptographic mismatch."*

---

### [4:00 - 4:45] Observability & Infrastructure as Code (45s)
- **Visual:** Show `docs/openapi.yaml`, `docker/docker-compose.yml`, `k8s/hpa.yaml`, and `terraform/rds.tf`.
- **Voiceover:**
  > *"For observability, our backend exposes standard `/health/live`, `/health/ready`, and Prometheus `/metrics` endpoints tracking request duration histograms and lock contention in real time.
  > For infrastructure as code, we provide full Docker multi-stage builds, Docker Compose, Kubernetes manifests with Horizontal Pod Autoscaler scaling from 3 to 30 replicas based on 70% CPU, and Terraform modules provisioning Multi-AZ Aurora PostgreSQL clusters with 5-minute RPO automated backups and AWS KMS envelope encryption."*

---

### [4:45 - 5:00] Conclusion & Submission (15s)
- **Visual:** Show README and GitHub repo.
- **Voiceover:**
  > *"In summary, Amrutam Telemedicine Backend delivers an enterprise-grade, battle-tested, secure, and observable platform ready for massive scale. Thank you!"*
