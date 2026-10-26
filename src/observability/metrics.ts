import client from 'prom-client';

// Create a distinct registry for Amrutam metrics
export const metricsRegistry = new client.Registry();

// Enable standard default metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register: metricsRegistry, prefix: 'amrutam_' });

// HTTP Request Counter
export const httpRequestCounter = new client.Counter({
  name: 'amrutam_http_requests_total',
  help: 'Total number of HTTP requests processed by Amrutam backend',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry]
});

// HTTP Request Duration Histogram (Latency SLO tracking for p50, p95 < 200ms read, < 500ms write)
export const httpRequestDuration = new client.Histogram({
  name: 'amrutam_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 2.0, 5.0],
  registers: [metricsRegistry]
});

// Consultation Business Metrics
export const consultationTotalCounter = new client.Counter({
  name: 'amrutam_consultations_total',
  help: 'Total number of consultations requested and processed',
  labelNames: ['status'],
  registers: [metricsRegistry]
});

export const activeConsultationsGauge = new client.Gauge({
  name: 'amrutam_active_consultations',
  help: 'Current number of active / in-progress telemedicine sessions',
  registers: [metricsRegistry]
});

// Distributed Lock Contention Counter
export const lockContentionCounter = new client.Counter({
  name: 'amrutam_lock_contention_total',
  help: 'Count of concurrent slot lock conflicts intercepted',
  labelNames: ['resource', 'result'],
  registers: [metricsRegistry]
});

// Booking Saga Duration and Outcomes
export const bookingSagaDuration = new client.Histogram({
  name: 'amrutam_booking_saga_duration_seconds',
  help: 'Duration of end-to-end booking saga execution including compensations',
  labelNames: ['outcome'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
  registers: [metricsRegistry]
});

// Idempotency Cache Hits
export const idempotencyHitsCounter = new client.Counter({
  name: 'amrutam_idempotency_cache_hits_total',
  help: 'Total duplicate write requests intercepted and served from idempotency cache',
  registers: [metricsRegistry]
});
