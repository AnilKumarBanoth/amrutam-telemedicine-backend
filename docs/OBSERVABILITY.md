# Amrutam Telemedicine Observability & SLO Guide

**Monitoring Standard:** OpenTelemetry (OTel), Prometheus, Grafana, Jaeger, Pino  
**Latency SLO:** p95 Reads < 200ms | p95 Writes < 500ms  
**Availability SLO:** 99.95% (< 21.6 minutes downtime / month)  

---

## 1. Metrics Dictionary (Prometheus)

All application metrics are exposed on the unauthenticated standard endpoint `/metrics`:

| Metric Name | Type | Labels | Description / Alert Threshold |
| :--- | :--- | :--- | :--- |
| `amrutam_http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests handled. Used to calculate error budget ($5xx / Total > 0.05\%$). |
| `amrutam_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency in seconds with buckets `[0.01, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 2.0, 5.0]`. Tracks p50, p95, p99. |
| `amrutam_consultations_total` | Counter | `status` (`REQUESTED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`) | Real-time consultation lifecycle business counter. |
| `amrutam_active_consultations` | Gauge | None | Number of concurrent active telemedicine consultation video sessions. |
| `amrutam_lock_contention_total` | Counter | `resource`, `result` (`acquired`, `conflict`) | Measures distributed lock contention on appointment slots. Alert if conflicts spike $> 5\%$. |
| `amrutam_booking_saga_duration_seconds` | Histogram | `outcome` (`success`, `failure`, `lock_conflict`) | End-to-end booking saga latency including slot reservation, payment, and confirmation. |
| `amrutam_idempotency_cache_hits_total` | Counter | None | Total number of duplicate write requests intercepted and served from cache without downstream DB impact. |

---

## 2. Structured Logging Standard (Pino)

All logs are written as single-line JSON objects to standard output (`stdout`) to comply with Twelve-Factor App principles and containerized log collectors (Fluentbit, AWS CloudWatch, Datadog):

### Example Structured Log:
```json
{
  "level": 30,
  "time": "2026-10-26T07:15:46.303Z",
  "service": "amrutam-telemedicine-backend",
  "env": "production",
  "traceId": "3783c6ed6838513f3d0b659faec365e0",
  "spanId": "07285d93275744fb",
  "userId": "c0000000-0000-0000-0000-000000000001",
  "slotId": "5844742a-152e-4641-a184-ccbe233330bc",
  "msg": "Initiating booking saga"
}
```

### Automatic Redaction:
Sensitive fields (`password`, `mfa_secret`, `token`, `clinical_notes_encrypted`, `medications_encrypted`) are masked automatically as `[REDACTED_SENSITIVE_PHI_OR_CREDENTIAL]` to prevent PHI/PII leakage into logging infrastructure.

---

## 3. Distributed Tracing & Context Propagation (W3C TraceContext)

- Standard W3C `traceparent` headers (`00-{traceId}-{spanId}-{flags}`) are parsed and propagated on all incoming requests.
- Downstream HTTP responses include headers:
  - `X-Trace-Id: 3783c6ed6838513f3d0b659faec365e0`
  - `X-Span-Id: 07285d93275744fb`
  - `traceparent: 00-3783c6ed6838513f3d0b659faec365e0-07285d93275744fb-01`
- Enables end-to-end request tracing across Edge Ingress $\to$ Backend API $\to$ PostgreSQL $\to$ Redis.

---

## 4. Alerting Rules & SLO Thresholds

| Alert Name | Severity | Condition | Action |
| :--- | :--- | :--- | :--- |
| **HighReadLatencySLOViolation** | Critical | `histogram_quantile(0.95, sum(rate(amrutam_http_request_duration_seconds_bucket{route=~"/api/v1/doctors.*"}[5m])) by (le)) > 0.200` | PagerDuty notification to On-Call; auto-scale read replicas. |
| **HighWriteLatencySLOViolation** | Critical | `histogram_quantile(0.95, sum(rate(amrutam_http_request_duration_seconds_bucket{route=~"/api/v1/bookings.*"}[5m])) by (le)) > 0.500` | Inspect PostgreSQL lock waits and Redis lock manager latency. |
| **ErrorBudgetDepletionAlert** | P1 | $5xx\text{ rate} > 0.05\%\text{ for } 10\text{ minutes}$ | Trigger automated rollback or investigate upstream payment gateway connectivity. |
| **ExcessiveLockContention** | Warning | `rate(amrutam_lock_contention_total{result="conflict"}[5m]) > 20` | Check if appointment release batch or marketing campaign concentrated users on a single slot. |
