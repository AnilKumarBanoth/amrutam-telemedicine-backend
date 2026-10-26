import request from 'supertest';
import { createApp } from '../../src/app';
import { asyncQueue } from '../../src/queue/asyncQueue';
import { db } from '../../src/storage/repository';

describe('Amrutam Telemedicine Backend Integration Tests', () => {
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let adminToken: string;
  let auditorToken: string;

  let seededDoctorId: string;
  let seededSlotId: string;
  let createdConsultationId: string;

  afterAll(() => {
    asyncQueue.stopWorker();
  });

  // --- 1. Observability & Health Checks ---
  describe('Observability & Health Checks', () => {
    it('GET /health/live should return 200 UP', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
    });

    it('GET /health/ready should return 200 READY', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.checks.storage).toBe('HEALTHY');
    });

    it('GET /metrics should return Prometheus metrics with custom counters', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('amrutam_http_requests_total');
      expect(res.text).toContain('amrutam_http_request_duration_seconds');
    });
  });

  // --- 2. Authentication & Roles ---
  describe('User Lifecycle & Authentication', () => {
    it('should login as seeded patient and receive JWT token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'patient.rahul@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      patientToken = res.body.data.tokens.accessToken;
    });

    it('should login as seeded doctor (Dr. Priya Sharma)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dr.priya@amrutam.co.in',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      doctorToken = res.body.data.tokens.accessToken;
    });

    it('should login as admin and auditor', async () => {
      const adminRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@amrutam.co.in', password: 'Password123!' });
      expect(adminRes.status).toBe(200);
      adminToken = adminRes.body.data.tokens.accessToken;

      const auditorRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'compliance@amrutam.co.in', password: 'Password123!' });
      expect(auditorRes.status).toBe(200);
      auditorToken = auditorRes.body.data.tokens.accessToken;
    });

    it('should register a new patient user', async () => {
      const randomEmail = `test.patient.${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: randomEmail,
          password: 'SecurePassword123!',
          role: 'PATIENT',
          firstName: 'Ananya',
          lastName: 'Deshmukh',
          phoneNumber: '+919876500000'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(randomEmail);
    });
  });

  // --- 3. Doctor Search & Filtering ---
  describe('Doctor Search & Discovery', () => {
    it('GET /api/v1/doctors should list available Ayurvedic doctors', async () => {
      const res = await request(app).get('/api/v1/doctors');
      expect(res.status).toBe(200);
      expect(res.body.data.doctors.length).toBeGreaterThanOrEqual(2);
      seededDoctorId = res.body.data.doctors[0].id;
    });

    it('GET /api/v1/doctors with specialization filter should filter accurately', async () => {
      const res = await request(app)
        .get('/api/v1/doctors')
        .query({ specialization: 'Kayachikitsa' });

      expect(res.status).toBe(200);
      expect(res.body.data.doctors.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.doctors[0].specialization).toContain('Kayachikitsa');
    });

    it('GET /api/v1/doctors/:id/slots should return available appointment slots', async () => {
      const res = await request(app).get(`/api/v1/doctors/${seededDoctorId}/slots`);
      expect(res.status).toBe(200);
      expect(res.body.data.slots.length).toBeGreaterThan(0);
      seededSlotId = res.body.data.slots[0].id;
    });
  });

  // --- 4. Concurrency & Booking Saga ---
  describe('Booking Saga & Concurrency Guard (Prevent Double Booking)', () => {
    it('should prevent double-booking under concurrent load: exactly 1 succeeds and 4 receive 409 Conflict', async () => {
      // Create a fresh dedicated slot for concurrent race test
      const slots = await db.createSlots([
        {
          doctor_id: seededDoctorId,
          start_time: new Date(Date.now() + 86400000),
          end_time: new Date(Date.now() + 90000000)
        }
      ]);
      const targetSlotId = slots[0].id;

      // Fire 5 simultaneous requests targeting the exact same slot
      const concurrentRequests = Array.from({ length: 5 }).map((_, idx) => {
        return request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${patientToken}`)
          .set('Idempotency-Key', `CONCURRENCY_TEST_KEY_${idx}_${Date.now()}`)
          .send({
            doctorId: seededDoctorId,
            slotId: targetSlotId,
            symptoms: `Concurrent booking attempt ${idx}`,
            paymentMethod: 'UPI'
          });
      });

      const responses = await Promise.all(concurrentRequests);
      const successful = responses.filter(r => r.status === 201);
      const conflicts = responses.filter(r => r.status === 409);

      // Exactly ONE request must succeed; all others MUST be rejected with 409 Conflict!
      expect(successful.length).toBe(1);
      expect(conflicts.length).toBe(4);
    });

    it('should test Idempotency-Key: duplicate request returns cached response with X-Cache: HIT-IDEMPOTENCY', async () => {
      const idempotencyKey = `IDEM_TEST_${Date.now()}`;

      // First call
      const res1 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          doctorId: seededDoctorId,
          slotId: seededSlotId,
          symptoms: 'Digestive bloating and acid reflux'
        });

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      createdConsultationId = res1.body.data.consultation.id;

      // Second duplicate call with same idempotency key
      const res2 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          doctorId: seededDoctorId,
          slotId: seededSlotId,
          symptoms: 'Digestive bloating and acid reflux'
        });

      expect(res2.status).toBe(201);
      expect(res2.headers['x-cache']).toBe('HIT-IDEMPOTENCY');
      expect(res2.body.data.consultation.id).toBe(createdConsultationId);
    });
  });

  // --- 5. Consultation Lifecycle & Encrypted Clinical Notes ---
  describe('Consultation Lifecycle & AES-256 Protected Health Information', () => {
    it('Doctor transitions consultation to IN_PROGRESS', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${createdConsultationId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
    });

    it('Doctor records encrypted clinical notes and diagnosis', async () => {
      const res = await request(app)
        .post(`/api/v1/consultations/${createdConsultationId}/clinical-notes`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          notes: 'Patient exhibits Agni mandya (impaired metabolic fire) and pitta aggravation.',
          diagnosis: 'Amlapitta (Hyperacidity) with mild vata disturbance'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Patient views consultation: clinical notes are decrypted transparently', async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/${createdConsultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.clinical_notes).toContain('Agni mandya');
      expect(res.body.data.diagnosis).toContain('Amlapitta');
    });

    it('Doctor completes consultation', async () => {
      const res = await request(app)
        .patch(`/api/v1/consultations/${createdConsultationId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
    });
  });

  // --- 6. Digital Prescriptions & Cryptographic Signatures ---
  describe('Prescriptions & Digital Signatures', () => {
    it('Doctor issues digital prescription with HMAC-SHA256 signature and encrypted medication items', async () => {
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          consultationId: createdConsultationId,
          medications: [
            {
              medicine_name: 'Avipattikar Churna',
              dosage: '3 grams',
              frequency: 'Twice daily before meals',
              duration_days: 14,
              instructions: 'Take with lukewarm water or honey'
            },
            {
              medicine_name: 'Kamadudha Ras (Moti Yukta)',
              dosage: '1 tablet (250mg)',
              frequency: 'Once daily in the morning',
              duration_days: 14,
              instructions: 'Take with milk'
            }
          ],
          instructions: 'Avoid excessively spicy, sour, and fermented foods during treatment.'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.digitalSignature).toBeDefined();
      expect(res.body.data.medications.length).toBe(2);
    });

    it('Patient views digital prescription', async () => {
      const res = await request(app)
        .get(`/api/v1/prescriptions/consultation/${createdConsultationId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.medications[0].medicine_name).toBe('Avipattikar Churna');
      expect(res.body.data.digitalSignature).toBeDefined();
    });
  });

  // --- 7. Compliance & Cryptographic Hash Chain Verification ---
  describe('Regulatory Audit Trails (Cryptographic Verification)', () => {
    it('Auditor verifies audit trail integrity across all events', async () => {
      const res = await request(app)
        .get('/api/v1/audit/verify-integrity')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.totalVerified).toBeGreaterThanOrEqual(5);
    });

    it('Auditor retrieves paginated audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${auditorToken}`)
        .query({ limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.logs.length).toBeGreaterThan(0);
      expect(res.body.data.logs[0].block_hash).toBeDefined();
      expect(res.body.data.logs[0].previous_hash).toBeDefined();
    });
  });

  // --- 8. Admin Analytics Dashboard ---
  describe('Admin Analytics Dashboard', () => {
    it('Admin views telemedicine system performance dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.overview.totalConsultations).toBeGreaterThanOrEqual(1);
      expect(res.body.data.scaleMetrics.dailyCapacityTarget).toBe(100000);
      expect(res.body.data.scaleMetrics.p95ReadLatencyTargetMs).toBe('<200ms');
    });
  });
});
