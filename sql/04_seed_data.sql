-- ============================================================================
-- Amrutam Telemedicine Platform - Seed Data
-- ============================================================================

-- Passwords are bcrypt hashes for: Password123!
-- Hash: $2a$10$wTqS4hPfZ7p4gC5O3VpEkeY7M3xG8v0LgHk3kXkR6t7Q8z9Y0W.1a (or runtime generated)

-- Seed Admin
INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled)
VALUES 
('a0000000-0000-0000-0000-000000000001', 'admin@amrutam.co.in', '$2a$10$qR6n4.E7zU2iE7j/qN0K3eaVbW8i1fO9k6q.QhC9H.t9v6A9l7H8q', 'ADMIN', TRUE, FALSE),
('a0000000-0000-0000-0000-000000000002', 'compliance@amrutam.co.in', '$2a$10$qR6n4.E7zU2iE7j/qN0K3eaVbW8i1fO9k6q.QhC9H.t9v6A9l7H8q', 'AUDITOR', TRUE, FALSE)
ON CONFLICT (email) DO NOTHING;

-- Seed Doctor 1 (Dr. Vaidya Priya Sharma - Ayurvedic Kayachikitsa)
INSERT INTO users (id, email, password_hash, role, is_active)
VALUES ('d0000000-0000-0000-0000-000000000001', 'dr.priya@amrutam.co.in', '$2a$10$qR6n4.E7zU2iE7j/qN0K3eaVbW8i1fO9k6q.QhC9H.t9v6A9l7H8q', 'DOCTOR', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, phone_number, gender, address_city, address_state)
VALUES ('d0000000-0000-0000-0000-000000000001', 'Priya', 'Sharma', '+919876543210', 'FEMALE', 'Varanasi', 'Uttar Pradesh')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO doctors (id, user_id, registration_number, specialization, sub_specialization, experience_years, consultation_fee, languages, bio, rating_avg, rating_count, is_verified)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'AYUSH-IN-2015-8891',
    'Kayachikitsa (Internal Medicine)',
    'Digestive & Gut Health, Chronic Inflammatory Disorders',
    12,
    750.00,
    ARRAY['English', 'Hindi', 'Sanskrit'],
    'Senior Ayurvedic physician specializing in holistic healing, gut microbiome balance, and lifestyle harmony.',
    4.92,
    215,
    TRUE
) ON CONFLICT (user_id) DO NOTHING;

-- Seed Doctor 2 (Dr. Arjun Nair - Panchakarma & Skin Care)
INSERT INTO users (id, email, password_hash, role, is_active)
VALUES ('d0000000-0000-0000-0000-000000000002', 'dr.arjun@amrutam.co.in', '$2a$10$qR6n4.E7zU2iE7j/qN0K3eaVbW8i1fO9k6q.QhC9H.t9v6A9l7H8q', 'DOCTOR', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, phone_number, gender, address_city, address_state)
VALUES ('d0000000-0000-0000-0000-000000000002', 'Arjun', 'Nair', '+919876543211', 'MALE', 'Kochi', 'Kerala')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO doctors (id, user_id, registration_number, specialization, sub_specialization, experience_years, consultation_fee, languages, bio, rating_avg, rating_count, is_verified)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'd0000000-0000-0000-0000-000000000002',
    'AYUSH-KL-2018-4421',
    'Twak Roga (Ayurvedic Dermatology)',
    'Psoriasis, Eczema, Natural Rejuvenation',
    8,
    600.00,
    ARRAY['English', 'Malayalam', 'Hindi'],
    'Kerala tradition trained Ayurvedic doctor focusing on chronic skin ailments and detox therapies.',
    4.85,
    148,
    TRUE
) ON CONFLICT (user_id) DO NOTHING;

-- Seed Patient 1
INSERT INTO users (id, email, password_hash, role, is_active)
VALUES ('c0000000-0000-0000-0000-000000000001', 'patient.rahul@example.com', '$2a$10$qR6n4.E7zU2iE7j/qN0K3eaVbW8i1fO9k6q.QhC9H.t9v6A9l7H8q', 'PATIENT', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, phone_number, date_of_birth, gender, blood_group, address_city, address_state)
VALUES ('c0000000-0000-0000-0000-000000000001', 'Rahul', 'Verma', '+919988776655', '1992-06-15', 'MALE', 'O+', 'Bengaluru', 'Karnataka')
ON CONFLICT (user_id) DO NOTHING;
