-- ============================================================================
-- Indexes and Constraints for High Performance & Latency SLA
-- p95 Reads < 200ms, p95 Writes < 500ms
-- ============================================================================

-- Partial index for active and available slots (super fast search filtering)
CREATE INDEX IF NOT EXISTS idx_slots_available ON availability_slots (doctor_id, start_time) 
WHERE status = 'AVAILABLE';

-- Index for doctor availability search by time range
CREATE INDEX IF NOT EXISTS idx_slots_time_range ON availability_slots (start_time, end_time);

-- Composite index for doctor search and faceted filtering
CREATE INDEX IF NOT EXISTS idx_doctors_specialization_fee ON doctors (specialization, consultation_fee, rating_avg DESC);

-- GIN index for doctor language matching
CREATE INDEX IF NOT EXISTS idx_doctors_languages ON doctors USING GIN (languages);

-- Consultations lookups by patient and doctor
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations (doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations (status);

-- Idempotency TTL lookups
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys (expires_at);

-- Audit query performance
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs (resource, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id, created_at DESC);
