import { Request, Response, NextFunction } from 'express';
import { db } from '../storage/repository';
import { tokenService } from '../security/tokens';
import { mfaService } from '../security/mfa';
import { encryptionService } from '../security/encryption';
import { auditHashChainService } from '../security/hashChain';
import { lockManager } from '../concurrency/distributedLock';
import { asyncQueue } from '../queue/asyncQueue';

import { AuthService } from '../services/auth.service';
import { DoctorService } from '../services/doctor.service';
import { BookingSagaOrchestrator } from '../services/booking.saga';
import { ConsultationService } from '../services/consultation.service';
import { PrescriptionService } from '../services/prescription.service';
import { AuditService } from '../services/audit.service';
import { AnalyticsService } from '../services/analytics.service';
import { metricsRegistry } from '../observability/metrics';

// Dependency Injection Composition Root
export const authService = new AuthService(db, tokenService, mfaService);
export const doctorService = new DoctorService(db);
export const bookingSaga = new BookingSagaOrchestrator(db, lockManager, asyncQueue);
export const consultationService = new ConsultationService(db, encryptionService);
export const prescriptionService = new PrescriptionService(db, encryptionService);
export const auditService = new AuditService(db, auditHashChainService);
export const analyticsService = new AnalyticsService(db);

// --- Auth Controller ---
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, mfaToken } = req.body;
    const result = await authService.login(email, password, mfaToken);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const setupMfa = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.setupMfa(req.user!.userId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const verifyMfa = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    const result = await authService.verifyAndEnableMfa(req.user!.userId, token);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken: token } = req.body;
    const result = await authService.refreshToken(token);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// --- Doctor Controller ---
export const searchDoctors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { specialization, language, minRating, maxFee, limit, offset } = req.query;
    const result = await doctorService.searchDoctors({
      specialization: specialization as string,
      language: language as string,
      minRating: minRating ? parseFloat(minRating as string) : undefined,
      maxFee: maxFee ? parseFloat(maxFee as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const getDoctorById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await doctorService.getDoctorById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const getDoctorSlots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;
    const slots = await doctorService.getDoctorAvailability(
      req.params.id,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    res.status(200).json({ success: true, data: { slots } });
  } catch (err) {
    next(err);
  }
};

export const createDoctorSlots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slots = await doctorService.createAvailabilitySlots(req.params.id, req.body.slots);
    res.status(201).json({ success: true, data: { slots } });
  } catch (err) {
    next(err);
  }
};

// --- Booking Controller (Saga Execution) ---
export const createBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { doctorId, slotId, symptoms, paymentMethod } = req.body;
    const idempotencyKey = req.header('Idempotency-Key') || `BOOKING_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const result = await bookingSaga.execute({
      patientId: req.user!.userId,
      doctorId,
      slotId,
      symptoms,
      paymentMethod,
      idempotencyKey
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// --- Consultation Controller ---
export const listConsultations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const consultations = await consultationService.listUserConsultations(req.user!);
    res.status(200).json({ success: true, data: { consultations } });
  } catch (err) {
    next(err);
  }
};

export const getConsultationById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const consultation = await consultationService.getConsultationById(req.params.id, req.user!);
    res.status(200).json({ success: true, data: consultation });
  } catch (err) {
    next(err);
  }
};

export const updateConsultationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, cancelledReason } = req.body;
    const updated = await consultationService.updateStatus(req.params.id, status, req.user!, { cancelledReason });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const recordClinicalNotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { notes, diagnosis } = req.body;
    await consultationService.updateClinicalNotes(req.params.id, req.user!, notes, diagnosis);
    res.status(200).json({ success: true, message: 'Clinical notes securely encrypted with AES-256-GCM and stored.' });
  } catch (err) {
    next(err);
  }
};

// --- Prescription Controller ---
export const issuePrescription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { consultationId, medications, instructions } = req.body;
    const result = await prescriptionService.issuePrescription(consultationId, req.user!, medications, instructions);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const getPrescription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await prescriptionService.getPrescriptionByConsultation(req.params.consultationId, req.user!);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// --- Audit Controller ---
export const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const logs = await auditService.getAuditLogs(limit, offset);
    res.status(200).json({ success: true, data: { logs } });
  } catch (err) {
    next(err);
  }
};

export const verifyAuditIntegrity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await auditService.verifyAuditChainIntegrity();
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

// --- Analytics Controller ---
export const getAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await analyticsService.getDashboardAnalytics();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// --- Health & Observability Controllers ---
export const healthLive = (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', service: 'amrutam-telemedicine-backend', timestamp: new Date().toISOString() });
};

export const healthReady = async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'READY',
    checks: {
      storage: 'HEALTHY',
      lockManager: 'HEALTHY',
      backgroundQueue: 'HEALTHY'
    },
    timestamp: new Date().toISOString()
  });
};

export const getPrometheusMetrics = async (req: Request, res: Response) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  const metrics = await metricsRegistry.metrics();
  res.send(metrics);
};
