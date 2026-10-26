# Amrutam Telemedicine Security Checklist & Threat Model

**Compliance Alignment:** HIPAA Security Rule, DISHA (Digital Information Security in Healthcare Act - India), OWASP Top 10:2021  
**Classification:** Confidential & Regulated Healthcare System  

---

## 1. STRIDE Threat Model & Attack Surface Analysis

| Threat Category | Potential Attack Surface | Vulnerability / Threat Scenario | Mitigation in Amrutam Architecture |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Authentication endpoints (`/auth/login`) | Credential stuffing, stolen passwords, brute-force attacks | • Bcrypt (10 salt rounds) password hashing<br/>• Time-based One-Time Password (TOTP) Multi-Factor Authentication<br/>• JWT with short TTL (1h) & cryptographically signed refresh tokens |
| **Tampering** | Prescriptions, Clinical Notes, Audit Logs | Rogue doctor or malicious insider altering medical records or deleting audit logs | • **AES-256-GCM** authenticated encryption with integrity tags<br/>• **HMAC-SHA256** digital signatures on all issued prescriptions<br/>• **SHA-256 cryptographic hash-chaining** on audit logs (tamper-evident block hashes) |
| **Repudiation** | Doctor consultation or prescription issuance | Doctor denies having prescribed a contraindicated drug or patient denies booking | • Every critical action recorded in immutable `audit_logs` with actor ID, IP, user-agent, timestamp, and digital signature |
| **Information Disclosure** | Protected Health Information (PHI) & PII in transit/at rest | Data leakage through database backups, logs, or unencrypted transit | • TLS 1.3 in transit with HSTS enforced<br/>• Field-level AES-256-GCM envelope encryption for clinical notes & prescriptions<br/>• Structured logging with automatic PII/PHI redaction in Pino |
| **Denial of Service** | Booking endpoints, search endpoints | Thundering herd, bot booking spam, resource starvation | • Sliding window token bucket rate limiting (100 req/min per IP/user)<br/>• Redis distributed lock with lease expiration (10s TTL)<br/>• Kubernetes Horizontal Pod Autoscaler (HPA) scaling up to 30 replicas |
| **Elevation of Privilege** | Direct Object Reference / IDOR | Patient viewing another patient's records or doctor modifying another doctor's slots | • Strict Role-Based Access Control (RBAC) + Attribute-Based Access Control (ABAC)<br/>• Ownership verification on every consultation and prescription lookup |

---

## 2. OWASP Top 10 (2021) Mitigation Matrix

| OWASP Risk | Description | Specific Mitigation in Amrutam Backend |
| :--- | :--- | :--- |
| **A01: Broken Access Control** | Unauthorized access to user records | Role guards (`requireRoles('DOCTOR', 'ADMIN')`), ABAC checks matching `patient_id` or `doctor_id` with `req.user.userId`. |
| **A02: Cryptographic Failures** | Exposed cleartext sensitive data | AES-256-GCM field encryption for PHI, HMAC-SHA256 digital signatures, AWS KMS envelope encryption at rest, TLS 1.3 in transit. |
| **A03: Injection** | SQL injection, NoSQL injection | Parameterized queries with `pg` query placeholders (`$1, $2`), Zod schema input validation for all request payloads. |
| **A04: Insecure Design** | Double booking, duplicate payment | Two-phase concurrency control (Redis distributed lock + PostgreSQL optimistic versioning) and `Idempotency-Key` middleware. |
| **A05: Security Misconfiguration** | Default credentials, unhardened headers | Helmet middleware with strict CSP, HSTS, X-Content-Type-Options: nosniff, non-root user in Docker container. |
| **A06: Vulnerable Dependencies** | Outdated or compromised npm libraries | Automated `npm audit` and Dependabot vulnerability scanning in CI/CD pipeline. |
| **A07: Identification Failures** | Weak auth, session hijacking | Multi-factor authentication (TOTP), rotating refresh tokens, rate-limited login endpoints. |
| **A08: Software & Data Integrity** | Tampering with prescriptions or logs | Digital signatures for prescriptions; SHA-256 parent hash chaining for audit logs with automated `verifyAuditChainIntegrity()` check. |
| **A09: Security Logging Failures** | Lack of traceability or unlogged actions | Structured JSON logging with trace/span correlation IDs, full regulatory audit logging for all auth, booking, and PHI operations. |
| **A10: Server-Side Request Forgery** | Malicious outgoing requests | Strict input sanitization; background webhooks execute in isolated workers without accessing private internal subnets. |

---

## 3. Data Classification Matrix

| Tier | Category | Examples | Encryption Requirement | Retention |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Restricted PHI)** | Medical records, clinical notes, diagnosis, prescribed medicines | `clinical_notes_encrypted`, `medications_encrypted`, `diagnosis_encrypted` | AES-256-GCM field-level encryption + KMS Key | 7 Years (Regulatory) |
| **Tier 2 (PII)** | Personal identities | `first_name`, `last_name`, `phone_number`, `date_of_birth`, `address` | Transparent Database Encryption (TDE) at rest, TLS in transit | Account Lifetime |
| **Tier 3 (Financial)** | Payment records | `amount`, `idempotency_key`, `provider_transaction_id` | TLS 1.3 in transit, KMS at rest, PCI-DSS tokenized via payment gateway | 7 Years (Financial) |
| **Tier 4 (Operational)** | Doctor credentials, public profiles | `specialization`, `languages`, `consultation_fee`, `rating_avg` | Publicly indexable with caching | Current |

---

## 4. Key Management & Rotation Policy

1. **Master Encryption Key (MEK):**
   - Managed via AWS Key Management Service (KMS) Customer Managed Keys (CMK).
   - Automated annual rotation enabled in AWS KMS.
2. **Data Encryption Keys (DEK) & Envelope Encryption:**
   - Field encryption uses key versioning metadata (`keyVersion: 'v1'`).
   - When key rotation occurs, new writes encrypt using `v2`, while old records remain readable with `v1` until scheduled re-encryption batch jobs migrate them.
3. **Emergency Key Compromise Procedure:**
   - Revoke active CMK alias in AWS KMS within 15 minutes.
   - Deploy emergency key revision via Kubernetes secrets.
   - Run cryptographic re-encryption worker across partitioned medical tables.

---

## 5. Tamper-Evident Audit Logging Specification

Every audit event is cryptographically anchored to its parent event:

$$\text{Block Hash}_n = \text{SHA-256}(\text{Block Hash}_{n-1} \parallel \text{Log ID} \parallel \text{Actor ID} \parallel \text{Action} \parallel \text{Resource} \parallel \text{Timestamp} \parallel \text{Details})$$

- If an adversary updates a single character in a past clinical audit entry or deletes a row in PostgreSQL, the entire subsequent chain becomes mathematically invalid.
- Compliance officers can invoke `/api/v1/audit/verify-integrity` at any time to verify cryptographic proof of zero tampering.
