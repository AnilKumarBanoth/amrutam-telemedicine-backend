-- ============================================================================
-- Amrutam Telemedicine Platform - Core PostgreSQL Relational Schema
-- Designed for High Concurrency (100k daily consultations), Zero Data Loss,
-- Strict Auditing, and Encrypted PHI (Protected Health Information)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Enum Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN', 'AUDITOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE consultation_status AS ENUM ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Users Table (Authentication & Access Control)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'PATIENT',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles Table (Patient & Doctor Personal Demographics)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30),
    date_of_birth DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    emergency_contact VARCHAR(100),
    address_city VARCHAR(100),
    address_state VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Doctors Table (Clinical Credentials & Specialization)
CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    registration_number VARCHAR(100) NOT NULL UNIQUE,
    specialization VARCHAR(100) NOT NULL,
    sub_specialization VARCHAR(150),
    experience_years INTEGER NOT NULL DEFAULT 0,
    consultation_fee NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
    languages TEXT[] NOT NULL DEFAULT ARRAY['English', 'Hindi'],
    bio TEXT,
    rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    rating_count INTEGER NOT NULL DEFAULT 0,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Availability Slots Table (Optimistic Locking & Concurrency Guard)
CREATE TABLE IF NOT EXISTS availability_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status slot_status NOT NULL DEFAULT 'AVAILABLE',
    held_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    held_at TIMESTAMPTZ,
    hold_expires_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_slot_time CHECK (end_time > start_time)
);

-- 5. Consultations Table (Core Telemedicine Session Lifecycle)
CREATE TABLE IF NOT EXISTS consultations (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    reference_no VARCHAR(64) NOT NULL,
    patient_id UUID NOT NULL REFERENCES users(id),
    doctor_id UUID NOT NULL REFERENCES doctors(id),
    slot_id UUID NOT NULL REFERENCES availability_slots(id),
    status consultation_status NOT NULL DEFAULT 'REQUESTED',
    symptoms TEXT,
    clinical_notes_encrypted TEXT,
    diagnosis_encrypted TEXT,
    room_url VARCHAR(512),
    cancelled_reason TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 6. Prescriptions Table (Signed Medical Artifacts with PHI Encryption)
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL,
    consultation_created_at TIMESTAMPTZ NOT NULL,
    doctor_id UUID NOT NULL REFERENCES doctors(id),
    patient_id UUID NOT NULL REFERENCES users(id),
    medications_encrypted TEXT NOT NULL,
    instructions_encrypted TEXT,
    digital_signature VARCHAR(255) NOT NULL,
    key_version VARCHAR(32) NOT NULL DEFAULT 'v1',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Payments Table (Idempotent Financial Transactions)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    consultation_id UUID NOT NULL,
    patient_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status payment_status NOT NULL DEFAULT 'PENDING',
    provider_name VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY_STUB',
    provider_transaction_id VARCHAR(128),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Audit Logs Table (Tamper-evident Hash Chained Regulatory Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    actor_id UUID,
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    previous_hash VARCHAR(64) NOT NULL,
    block_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 9. Idempotency Keys Cache Table (Fast deduplication & payload replay)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(128) PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    request_hash VARCHAR(64) NOT NULL,
    response_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
