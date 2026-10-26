-- ============================================================================
-- PostgreSQL Table Partitioning Strategy
-- Target Scale: 100,000 Consultations / Day = ~3,000,000 Consultations / Month
-- Audit Logs: ~10,000,000 Events / Month
-- Partition Strategy: Range partitioning by month with automated maintenance
-- ============================================================================

-- Consultations Monthly Partitions (2026-2027)
CREATE TABLE IF NOT EXISTS consultations_2026_10 PARTITION OF consultations
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_2026_11 PARTITION OF consultations
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_2026_12 PARTITION OF consultations
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS consultations_default PARTITION OF consultations DEFAULT;

-- Audit Logs Monthly Partitions (2026-2027)
CREATE TABLE IF NOT EXISTS audit_logs_2026_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_2026_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_2026_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;
