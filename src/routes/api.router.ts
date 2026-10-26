import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers';
import { authenticateJwt, optionalAuthenticateJwt } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/rbac.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { USER_ROLES } from '../config/constants';

export const apiRouter = Router();

// ============================================================================
// Health & Observability Endpoints (Unauthenticated for K8s & Prometheus)
// ============================================================================
apiRouter.get('/health/live', ctrl.healthLive);
apiRouter.get('/health/ready', ctrl.healthReady);
apiRouter.get('/metrics', ctrl.getPrometheusMetrics);

// ============================================================================
// Auth Validation Schemas
// ============================================================================
const registerSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN', 'AUDITOR']),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phoneNumber: z.string().optional(),
    registrationNumber: z.string().optional(),
    specialization: z.string().optional(),
    consultationFee: z.number().positive().optional(),
    experienceYears: z.number().int().nonnegative().optional()
  })
};

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string(),
    mfaToken: z.string().optional()
  })
};

const verifyMfaSchema = {
  body: z.object({
    token: z.string().length(6, 'TOTP token must be 6 digits')
  })
};

// Auth Routes
apiRouter.post('/api/v1/auth/register', validateRequest(registerSchema), ctrl.register);
apiRouter.post('/api/v1/auth/login', validateRequest(loginSchema), ctrl.login);
apiRouter.post('/api/v1/auth/mfa/setup', authenticateJwt, ctrl.setupMfa);
apiRouter.post('/api/v1/auth/mfa/verify', authenticateJwt, validateRequest(verifyMfaSchema), ctrl.verifyMfa);
apiRouter.post('/api/v1/auth/refresh', ctrl.refreshToken);

// ============================================================================
// Doctor Routes
// ============================================================================
apiRouter.get('/api/v1/doctors', ctrl.searchDoctors);
apiRouter.get('/api/v1/doctors/:id', ctrl.getDoctorById);
apiRouter.get('/api/v1/doctors/:id/slots', ctrl.getDoctorSlots);
apiRouter.post(
  '/api/v1/doctors/:id/slots',
  authenticateJwt,
  requireRoles('DOCTOR', 'ADMIN'),
  ctrl.createDoctorSlots
);

// ============================================================================
// Booking Routes (Saga Orchestration + Idempotency Guard)
// ============================================================================
const bookingSchema = {
  body: z.object({
    doctorId: z.string().uuid(),
    slotId: z.string().uuid(),
    symptoms: z.string().optional(),
    paymentMethod: z.string().optional()
  })
};

apiRouter.post(
  '/api/v1/bookings',
  authenticateJwt,
  requireRoles('PATIENT', 'ADMIN'),
  idempotencyMiddleware,
  validateRequest(bookingSchema),
  ctrl.createBooking
);

// ============================================================================
// Consultation Lifecycle Routes
// ============================================================================
apiRouter.get('/api/v1/consultations', authenticateJwt, ctrl.listConsultations);
apiRouter.get('/api/v1/consultations/:id', authenticateJwt, ctrl.getConsultationById);

const updateStatusSchema = {
  body: z.object({
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    cancelledReason: z.string().optional()
  })
};
apiRouter.patch(
  '/api/v1/consultations/:id/status',
  authenticateJwt,
  validateRequest(updateStatusSchema),
  ctrl.updateConsultationStatus
);

const clinicalNotesSchema = {
  body: z.object({
    notes: z.string().min(1, 'Clinical notes are required'),
    diagnosis: z.string().min(1, 'Diagnosis is required')
  })
};
apiRouter.post(
  '/api/v1/consultations/:id/clinical-notes',
  authenticateJwt,
  requireRoles('DOCTOR', 'ADMIN'),
  validateRequest(clinicalNotesSchema),
  ctrl.recordClinicalNotes
);

// ============================================================================
// Prescription Routes (Digital Signatures & PHI Encryption)
// ============================================================================
const issuePrescriptionSchema = {
  body: z.object({
    consultationId: z.string().uuid(),
    medications: z.array(
      z.object({
        medicine_name: z.string(),
        dosage: z.string(),
        frequency: z.string(),
        duration_days: z.number().int().positive(),
        instructions: z.string()
      })
    ).min(1),
    instructions: z.string().optional()
  })
};

apiRouter.post(
  '/api/v1/prescriptions',
  authenticateJwt,
  requireRoles('DOCTOR', 'ADMIN'),
  validateRequest(issuePrescriptionSchema),
  ctrl.issuePrescription
);

apiRouter.get(
  '/api/v1/prescriptions/consultation/:consultationId',
  authenticateJwt,
  ctrl.getPrescription
);

// ============================================================================
// Compliance & Audit Trails (Cryptographic Hash Chaining)
// ============================================================================
apiRouter.get(
  '/api/v1/audit/logs',
  authenticateJwt,
  requireRoles('AUDITOR', 'ADMIN'),
  ctrl.getAuditLogs
);

apiRouter.get(
  '/api/v1/audit/verify-integrity',
  authenticateJwt,
  requireRoles('AUDITOR', 'ADMIN'),
  ctrl.verifyAuditIntegrity
);

// ============================================================================
// Admin Analytics
// ============================================================================
apiRouter.get(
  '/api/v1/analytics/dashboard',
  authenticateJwt,
  requireRoles('ADMIN', 'AUDITOR'),
  ctrl.getAnalytics
);
